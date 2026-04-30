
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."AIClientToolDefinition" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NOT NULL,
 "Category" VARCHAR(50) NULL,
 "InputSchemaJSON" TEXT NULL,
 "OutputSchemaJSON" TEXT NULL,
 "DefaultTimeoutMs" INTEGER NULL DEFAULT 30000,
 "RequiresContextType" VARCHAR(100) NULL,
 CONSTRAINT PK_AIClientToolDefinition PRIMARY KEY ("ID"),
 CONSTRAINT UQ_AIClientToolDefinition_Name UNIQUE ("Name")
);

-- Extended properties for AIClientToolDefinition columns;

CREATE TABLE __mj."AIAgentClientTool" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "AgentID" UUID NOT NULL,
 "ClientToolDefinitionID" UUID NOT NULL,
 "IsRequired" BOOLEAN NOT NULL DEFAULT FALSE,
 "Priority" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT PK_AIAgentClientTool PRIMARY KEY ("ID"),
 CONSTRAINT FK_AIAgentClientTool_Agent FOREIGN KEY ("AgentID")
 REFERENCES __mj."AIAgent"("ID"),
 CONSTRAINT FK_AIAgentClientTool_ToolDefinition FOREIGN KEY ("ClientToolDefinitionID")
 REFERENCES __mj."AIClientToolDefinition"("ID"),
 CONSTRAINT UQ_AIAgentClientTool UNIQUE ("AgentID", "ClientToolDefinitionID")
);

-- Extended properties for AIAgentClientTool columns;

ALTER TABLE __mj."AIAgent"
 ADD COLUMN "AllowEphemeralClientTools" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE __mj."AIAgentClientTool"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentClientTool" */

ALTER TABLE __mj."AIAgentClientTool" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentClientTool" */

ALTER TABLE __mj."AIAgentClientTool"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentClientTool" */

ALTER TABLE __mj."AIAgentClientTool" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIClientToolDefinition" */

ALTER TABLE __mj."AIClientToolDefinition"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIClientToolDefinition" */

ALTER TABLE __mj."AIClientToolDefinition" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIClientToolDefinition" */

ALTER TABLE __mj."AIClientToolDefinition"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIClientToolDefinition" */

ALTER TABLE __mj."AIClientToolDefinition" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to insert new entity field */

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentClientTool_AgentID" ON __mj."AIAgentClientTool" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentClientTool_ClientToolDefinitionID" ON __mj."AIAgentClientTool" ("ClientToolDefinitionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ParentID" ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID" ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_TypeID" ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID" ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID" ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID" ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_CategoryID" ON __mj."AIAgent" ("CategoryID");


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."fnAIAgentParentID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgent" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAIAgentClientTools';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentClientTools"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJAIClientToolDefinition_ClientToolDefinitionID"."Name" AS "ClientToolDefinition"
FROM
    __mj."AIAgentClientTool" AS a
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
INNER JOIN
    __mj."AIClientToolDefinition" AS "MJAIClientToolDefinition_ClientToolDefinitionID"
  ON
    a."ClientToolDefinitionID" = "MJAIClientToolDefinition_ClientToolDefinitionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIClientToolDefinitions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIClientToolDefinitions"
AS SELECT
    a.*
FROM
    __mj."AIClientToolDefinition" AS a$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgents';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
AS SELECT
    a.*,
    "MJAIAgent_ParentID"."Name" AS "Parent",
    "MJAIPrompt_ContextCompressionPromptID"."Name" AS "ContextCompressionPrompt",
    "MJAIAgentType_TypeID"."Name" AS "Type",
    "MJArtifactType_DefaultArtifactTypeID"."Name" AS "DefaultArtifactType",
    "MJUser_OwnerUserID"."Name" AS "OwnerUser",
    "MJFileStorageProvider_AttachmentStorageProviderID"."Name" AS "AttachmentStorageProvider",
    "MJAIAgentCategory_CategoryID"."Name" AS "Category",
    "root_ParentID"."RootID" AS "RootParentID"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_ParentID"
  ON
    a."ParentID" = "MJAIAgent_ParentID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ContextCompressionPromptID"
  ON
    a."ContextCompressionPromptID" = "MJAIPrompt_ContextCompressionPromptID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS "MJAIAgentType_TypeID"
  ON
    a."TypeID" = "MJAIAgentType_TypeID"."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS "MJArtifactType_DefaultArtifactTypeID"
  ON
    a."DefaultArtifactTypeID" = "MJArtifactType_DefaultArtifactTypeID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_OwnerUserID"
  ON
    a."OwnerUserID" = "MJUser_OwnerUserID"."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS "MJFileStorageProvider_AttachmentStorageProviderID"
  ON
    a."AttachmentStorageProviderID" = "MJFileStorageProvider_AttachmentStorageProviderID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS "MJAIAgentCategory_CategoryID"
  ON
    a."CategoryID" = "MJAIAgentCategory_CategoryID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentParentID_GetRootID"(a."ID", a."ParentID")) AS "root_ParentID" ON TRUE$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentClientTool"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_ClientToolDefinitionID UUID DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentClientTools" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentClientTool"
            (
                "ID",
                "AgentID",
                "ClientToolDefinitionID",
                "IsRequired",
                "Priority"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                p_ClientToolDefinitionID,
                COALESCE(p_IsRequired, FALSE),
                COALESCE(p_Priority, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentClientTool"
            (
                "AgentID",
                "ClientToolDefinitionID",
                "IsRequired",
                "Priority"
            )
        VALUES
            (
                p_AgentID,
                p_ClientToolDefinitionID,
                COALESCE(p_IsRequired, FALSE),
                COALESCE(p_Priority, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentClientTools" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentClientTool"(
    IN p_ID UUID,
    IN p_AgentID UUID,
    IN p_ClientToolDefinitionID UUID,
    IN p_IsRequired BOOLEAN,
    IN p_Priority INTEGER
)
RETURNS SETOF __mj."vwAIAgentClientTools" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentClientTool"
    SET
        "AgentID" = p_AgentID,
        "ClientToolDefinitionID" = p_ClientToolDefinitionID,
        "IsRequired" = p_IsRequired,
        "Priority" = p_Priority
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentClientTools" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentClientTools" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentClientTool"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentClientTool"
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIClientToolDefinition"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Category VARCHAR(50) DEFAULT NULL,
    IN p_InputSchemaJSON TEXT DEFAULT NULL,
    IN p_OutputSchemaJSON TEXT DEFAULT NULL,
    IN p_DefaultTimeoutMs INTEGER DEFAULT NULL,
    IN p_RequiresContextType VARCHAR(100) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIClientToolDefinitions" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIClientToolDefinition"
            (
                "ID",
                "Name",
                "Description",
                "Category",
                "InputSchemaJSON",
                "OutputSchemaJSON",
                "DefaultTimeoutMs",
                "RequiresContextType"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_Category,
                p_InputSchemaJSON,
                p_OutputSchemaJSON,
                p_DefaultTimeoutMs,
                p_RequiresContextType
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIClientToolDefinition"
            (
                "Name",
                "Description",
                "Category",
                "InputSchemaJSON",
                "OutputSchemaJSON",
                "DefaultTimeoutMs",
                "RequiresContextType"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_Category,
                p_InputSchemaJSON,
                p_OutputSchemaJSON,
                p_DefaultTimeoutMs,
                p_RequiresContextType
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIClientToolDefinitions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIClientToolDefinition"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200),
    IN p_Description TEXT,
    IN p_Category VARCHAR(50),
    IN p_InputSchemaJSON TEXT,
    IN p_OutputSchemaJSON TEXT,
    IN p_DefaultTimeoutMs INTEGER,
    IN p_RequiresContextType VARCHAR(100)
)
RETURNS SETOF __mj."vwAIClientToolDefinitions" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIClientToolDefinition"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Category" = p_Category,
        "InputSchemaJSON" = p_InputSchemaJSON,
        "OutputSchemaJSON" = p_OutputSchemaJSON,
        "DefaultTimeoutMs" = p_DefaultTimeoutMs,
        "RequiresContextType" = p_RequiresContextType
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIClientToolDefinitions" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIClientToolDefinitions" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIClientToolDefinition"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIClientToolDefinition"
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_LogoURL VARCHAR(255) DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_ExposeAsAction BOOLEAN DEFAULT NULL,
    IN p_ExecutionOrder INTEGER DEFAULT NULL,
    IN p_ExecutionMode VARCHAR(20) DEFAULT NULL,
    IN p_EnableContextCompression BOOLEAN DEFAULT NULL,
    IN p_ContextCompressionMessageThreshold INTEGER DEFAULT NULL,
    IN p_ContextCompressionPromptID UUID DEFAULT NULL,
    IN p_ContextCompressionMessageRetentionCount INTEGER DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_IconClass VARCHAR(100) DEFAULT NULL,
    IN p_ModelSelectionMode VARCHAR(50) DEFAULT NULL,
    IN p_PayloadDownstreamPaths TEXT DEFAULT NULL,
    IN p_PayloadUpstreamPaths TEXT DEFAULT NULL,
    IN p_PayloadSelfReadPaths TEXT DEFAULT NULL,
    IN p_PayloadSelfWritePaths TEXT DEFAULT NULL,
    IN p_PayloadScope TEXT DEFAULT NULL,
    IN p_FinalPayloadValidation TEXT DEFAULT NULL,
    IN p_FinalPayloadValidationMode VARCHAR(25) DEFAULT NULL,
    IN p_FinalPayloadValidationMaxRetries INTEGER DEFAULT NULL,
    IN p_MaxCostPerRun NUMERIC(10,4) DEFAULT NULL,
    IN p_MaxTokensPerRun INTEGER DEFAULT NULL,
    IN p_MaxIterationsPerRun INTEGER DEFAULT NULL,
    IN p_MaxTimePerRun INTEGER DEFAULT NULL,
    IN p_MinExecutionsPerRun INTEGER DEFAULT NULL,
    IN p_MaxExecutionsPerRun INTEGER DEFAULT NULL,
    IN p_StartingPayloadValidation TEXT DEFAULT NULL,
    IN p_StartingPayloadValidationMode VARCHAR(25) DEFAULT NULL,
    IN p_DefaultPromptEffortLevel INTEGER DEFAULT NULL,
    IN p_ChatHandlingOption VARCHAR(30) DEFAULT NULL,
    IN p_DefaultArtifactTypeID UUID DEFAULT NULL,
    IN p_OwnerUserID UUID DEFAULT NULL,
    IN p_InvocationMode VARCHAR(20) DEFAULT NULL,
    IN p_ArtifactCreationMode VARCHAR(20) DEFAULT NULL,
    IN p_FunctionalRequirements TEXT DEFAULT NULL,
    IN p_TechnicalDesign TEXT DEFAULT NULL,
    IN p_InjectNotes BOOLEAN DEFAULT NULL,
    IN p_MaxNotesToInject INTEGER DEFAULT NULL,
    IN p_NoteInjectionStrategy VARCHAR(20) DEFAULT NULL,
    IN p_InjectExamples BOOLEAN DEFAULT NULL,
    IN p_MaxExamplesToInject INTEGER DEFAULT NULL,
    IN p_ExampleInjectionStrategy VARCHAR(20) DEFAULT NULL,
    IN p_IsRestricted BOOLEAN DEFAULT NULL,
    IN p_MessageMode VARCHAR(50) DEFAULT NULL,
    IN p_MaxMessages INTEGER DEFAULT NULL,
    IN p_AttachmentStorageProviderID UUID DEFAULT NULL,
    IN p_AttachmentRootPath VARCHAR(500) DEFAULT NULL,
    IN p_InlineStorageThresholdBytes INTEGER DEFAULT NULL,
    IN p_AgentTypePromptParams TEXT DEFAULT NULL,
    IN p_ScopeConfig TEXT DEFAULT NULL,
    IN p_NoteRetentionDays INTEGER DEFAULT NULL,
    IN p_ExampleRetentionDays INTEGER DEFAULT NULL,
    IN p_AutoArchiveEnabled BOOLEAN DEFAULT NULL,
    IN p_RerankerConfiguration TEXT DEFAULT NULL,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_AllowEphemeralClientTools BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgents" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgent"
            (
                "ID",
                "Name",
                "Description",
                "LogoURL",
                "ParentID",
                "ExposeAsAction",
                "ExecutionOrder",
                "ExecutionMode",
                "EnableContextCompression",
                "ContextCompressionMessageThreshold",
                "ContextCompressionPromptID",
                "ContextCompressionMessageRetentionCount",
                "TypeID",
                "Status",
                "DriverClass",
                "IconClass",
                "ModelSelectionMode",
                "PayloadDownstreamPaths",
                "PayloadUpstreamPaths",
                "PayloadSelfReadPaths",
                "PayloadSelfWritePaths",
                "PayloadScope",
                "FinalPayloadValidation",
                "FinalPayloadValidationMode",
                "FinalPayloadValidationMaxRetries",
                "MaxCostPerRun",
                "MaxTokensPerRun",
                "MaxIterationsPerRun",
                "MaxTimePerRun",
                "MinExecutionsPerRun",
                "MaxExecutionsPerRun",
                "StartingPayloadValidation",
                "StartingPayloadValidationMode",
                "DefaultPromptEffortLevel",
                "ChatHandlingOption",
                "DefaultArtifactTypeID",
                "OwnerUserID",
                "InvocationMode",
                "ArtifactCreationMode",
                "FunctionalRequirements",
                "TechnicalDesign",
                "InjectNotes",
                "MaxNotesToInject",
                "NoteInjectionStrategy",
                "InjectExamples",
                "MaxExamplesToInject",
                "ExampleInjectionStrategy",
                "IsRestricted",
                "MessageMode",
                "MaxMessages",
                "AttachmentStorageProviderID",
                "AttachmentRootPath",
                "InlineStorageThresholdBytes",
                "AgentTypePromptParams",
                "ScopeConfig",
                "NoteRetentionDays",
                "ExampleRetentionDays",
                "AutoArchiveEnabled",
                "RerankerConfiguration",
                "CategoryID",
                "AllowEphemeralClientTools"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_LogoURL,
                p_ParentID,
                COALESCE(p_ExposeAsAction, FALSE),
                COALESCE(p_ExecutionOrder, 0),
                COALESCE(p_ExecutionMode, 'Sequential'),
                COALESCE(p_EnableContextCompression, FALSE),
                p_ContextCompressionMessageThreshold,
                p_ContextCompressionPromptID,
                p_ContextCompressionMessageRetentionCount,
                p_TypeID,
                COALESCE(p_Status, 'Pending'),
                p_DriverClass,
                p_IconClass,
                COALESCE(p_ModelSelectionMode, 'Agent Type'),
                COALESCE(p_PayloadDownstreamPaths, '["*"]'),
                COALESCE(p_PayloadUpstreamPaths, '["*"]'),
                p_PayloadSelfReadPaths,
                p_PayloadSelfWritePaths,
                p_PayloadScope,
                p_FinalPayloadValidation,
                COALESCE(p_FinalPayloadValidationMode, 'Retry'),
                COALESCE(p_FinalPayloadValidationMaxRetries, 3),
                p_MaxCostPerRun,
                p_MaxTokensPerRun,
                p_MaxIterationsPerRun,
                p_MaxTimePerRun,
                p_MinExecutionsPerRun,
                p_MaxExecutionsPerRun,
                p_StartingPayloadValidation,
                COALESCE(p_StartingPayloadValidationMode, 'Fail'),
                p_DefaultPromptEffortLevel,
                p_ChatHandlingOption,
                p_DefaultArtifactTypeID,
                CASE p_OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE COALESCE(p_OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                COALESCE(p_InvocationMode, 'Any'),
                COALESCE(p_ArtifactCreationMode, 'Always'),
                p_FunctionalRequirements,
                p_TechnicalDesign,
                COALESCE(p_InjectNotes, TRUE),
                COALESCE(p_MaxNotesToInject, 5),
                COALESCE(p_NoteInjectionStrategy, 'Relevant'),
                COALESCE(p_InjectExamples, FALSE),
                COALESCE(p_MaxExamplesToInject, 3),
                COALESCE(p_ExampleInjectionStrategy, 'Semantic'),
                COALESCE(p_IsRestricted, FALSE),
                COALESCE(p_MessageMode, 'None'),
                p_MaxMessages,
                p_AttachmentStorageProviderID,
                p_AttachmentRootPath,
                p_InlineStorageThresholdBytes,
                p_AgentTypePromptParams,
                p_ScopeConfig,
                p_NoteRetentionDays,
                p_ExampleRetentionDays,
                COALESCE(p_AutoArchiveEnabled, TRUE),
                p_RerankerConfiguration,
                p_CategoryID,
                COALESCE(p_AllowEphemeralClientTools, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgent"
            (
                "Name",
                "Description",
                "LogoURL",
                "ParentID",
                "ExposeAsAction",
                "ExecutionOrder",
                "ExecutionMode",
                "EnableContextCompression",
                "ContextCompressionMessageThreshold",
                "ContextCompressionPromptID",
                "ContextCompressionMessageRetentionCount",
                "TypeID",
                "Status",
                "DriverClass",
                "IconClass",
                "ModelSelectionMode",
                "PayloadDownstreamPaths",
                "PayloadUpstreamPaths",
                "PayloadSelfReadPaths",
                "PayloadSelfWritePaths",
                "PayloadScope",
                "FinalPayloadValidation",
                "FinalPayloadValidationMode",
                "FinalPayloadValidationMaxRetries",
                "MaxCostPerRun",
                "MaxTokensPerRun",
                "MaxIterationsPerRun",
                "MaxTimePerRun",
                "MinExecutionsPerRun",
                "MaxExecutionsPerRun",
                "StartingPayloadValidation",
                "StartingPayloadValidationMode",
                "DefaultPromptEffortLevel",
                "ChatHandlingOption",
                "DefaultArtifactTypeID",
                "OwnerUserID",
                "InvocationMode",
                "ArtifactCreationMode",
                "FunctionalRequirements",
                "TechnicalDesign",
                "InjectNotes",
                "MaxNotesToInject",
                "NoteInjectionStrategy",
                "InjectExamples",
                "MaxExamplesToInject",
                "ExampleInjectionStrategy",
                "IsRestricted",
                "MessageMode",
                "MaxMessages",
                "AttachmentStorageProviderID",
                "AttachmentRootPath",
                "InlineStorageThresholdBytes",
                "AgentTypePromptParams",
                "ScopeConfig",
                "NoteRetentionDays",
                "ExampleRetentionDays",
                "AutoArchiveEnabled",
                "RerankerConfiguration",
                "CategoryID",
                "AllowEphemeralClientTools"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_LogoURL,
                p_ParentID,
                COALESCE(p_ExposeAsAction, FALSE),
                COALESCE(p_ExecutionOrder, 0),
                COALESCE(p_ExecutionMode, 'Sequential'),
                COALESCE(p_EnableContextCompression, FALSE),
                p_ContextCompressionMessageThreshold,
                p_ContextCompressionPromptID,
                p_ContextCompressionMessageRetentionCount,
                p_TypeID,
                COALESCE(p_Status, 'Pending'),
                p_DriverClass,
                p_IconClass,
                COALESCE(p_ModelSelectionMode, 'Agent Type'),
                COALESCE(p_PayloadDownstreamPaths, '["*"]'),
                COALESCE(p_PayloadUpstreamPaths, '["*"]'),
                p_PayloadSelfReadPaths,
                p_PayloadSelfWritePaths,
                p_PayloadScope,
                p_FinalPayloadValidation,
                COALESCE(p_FinalPayloadValidationMode, 'Retry'),
                COALESCE(p_FinalPayloadValidationMaxRetries, 3),
                p_MaxCostPerRun,
                p_MaxTokensPerRun,
                p_MaxIterationsPerRun,
                p_MaxTimePerRun,
                p_MinExecutionsPerRun,
                p_MaxExecutionsPerRun,
                p_StartingPayloadValidation,
                COALESCE(p_StartingPayloadValidationMode, 'Fail'),
                p_DefaultPromptEffortLevel,
                p_ChatHandlingOption,
                p_DefaultArtifactTypeID,
                CASE p_OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE COALESCE(p_OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                COALESCE(p_InvocationMode, 'Any'),
                COALESCE(p_ArtifactCreationMode, 'Always'),
                p_FunctionalRequirements,
                p_TechnicalDesign,
                COALESCE(p_InjectNotes, TRUE),
                COALESCE(p_MaxNotesToInject, 5),
                COALESCE(p_NoteInjectionStrategy, 'Relevant'),
                COALESCE(p_InjectExamples, FALSE),
                COALESCE(p_MaxExamplesToInject, 3),
                COALESCE(p_ExampleInjectionStrategy, 'Semantic'),
                COALESCE(p_IsRestricted, FALSE),
                COALESCE(p_MessageMode, 'None'),
                p_MaxMessages,
                p_AttachmentStorageProviderID,
                p_AttachmentRootPath,
                p_InlineStorageThresholdBytes,
                p_AgentTypePromptParams,
                p_ScopeConfig,
                p_NoteRetentionDays,
                p_ExampleRetentionDays,
                COALESCE(p_AutoArchiveEnabled, TRUE),
                p_RerankerConfiguration,
                p_CategoryID,
                COALESCE(p_AllowEphemeralClientTools, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_LogoURL VARCHAR(255),
    IN p_ParentID UUID,
    IN p_ExposeAsAction BOOLEAN,
    IN p_ExecutionOrder INTEGER,
    IN p_ExecutionMode VARCHAR(20),
    IN p_EnableContextCompression BOOLEAN,
    IN p_ContextCompressionMessageThreshold INTEGER,
    IN p_ContextCompressionPromptID UUID,
    IN p_ContextCompressionMessageRetentionCount INTEGER,
    IN p_TypeID UUID,
    IN p_Status VARCHAR(20),
    IN p_DriverClass VARCHAR(255),
    IN p_IconClass VARCHAR(100),
    IN p_ModelSelectionMode VARCHAR(50),
    IN p_PayloadDownstreamPaths TEXT,
    IN p_PayloadUpstreamPaths TEXT,
    IN p_PayloadSelfReadPaths TEXT,
    IN p_PayloadSelfWritePaths TEXT,
    IN p_PayloadScope TEXT,
    IN p_FinalPayloadValidation TEXT,
    IN p_FinalPayloadValidationMode VARCHAR(25),
    IN p_FinalPayloadValidationMaxRetries INTEGER,
    IN p_MaxCostPerRun NUMERIC(10,4),
    IN p_MaxTokensPerRun INTEGER,
    IN p_MaxIterationsPerRun INTEGER,
    IN p_MaxTimePerRun INTEGER,
    IN p_MinExecutionsPerRun INTEGER,
    IN p_MaxExecutionsPerRun INTEGER,
    IN p_StartingPayloadValidation TEXT,
    IN p_StartingPayloadValidationMode VARCHAR(25),
    IN p_DefaultPromptEffortLevel INTEGER,
    IN p_ChatHandlingOption VARCHAR(30),
    IN p_DefaultArtifactTypeID UUID,
    IN p_OwnerUserID UUID,
    IN p_InvocationMode VARCHAR(20),
    IN p_ArtifactCreationMode VARCHAR(20),
    IN p_FunctionalRequirements TEXT,
    IN p_TechnicalDesign TEXT,
    IN p_InjectNotes BOOLEAN,
    IN p_MaxNotesToInject INTEGER,
    IN p_NoteInjectionStrategy VARCHAR(20),
    IN p_InjectExamples BOOLEAN,
    IN p_MaxExamplesToInject INTEGER,
    IN p_ExampleInjectionStrategy VARCHAR(20),
    IN p_IsRestricted BOOLEAN,
    IN p_MessageMode VARCHAR(50),
    IN p_MaxMessages INTEGER,
    IN p_AttachmentStorageProviderID UUID,
    IN p_AttachmentRootPath VARCHAR(500),
    IN p_InlineStorageThresholdBytes INTEGER,
    IN p_AgentTypePromptParams TEXT,
    IN p_ScopeConfig TEXT,
    IN p_NoteRetentionDays INTEGER,
    IN p_ExampleRetentionDays INTEGER,
    IN p_AutoArchiveEnabled BOOLEAN,
    IN p_RerankerConfiguration TEXT,
    IN p_CategoryID UUID,
    IN p_AllowEphemeralClientTools BOOLEAN
)
RETURNS SETOF __mj."vwAIAgents" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgent"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "LogoURL" = p_LogoURL,
        "ParentID" = p_ParentID,
        "ExposeAsAction" = p_ExposeAsAction,
        "ExecutionOrder" = p_ExecutionOrder,
        "ExecutionMode" = p_ExecutionMode,
        "EnableContextCompression" = p_EnableContextCompression,
        "ContextCompressionMessageThreshold" = p_ContextCompressionMessageThreshold,
        "ContextCompressionPromptID" = p_ContextCompressionPromptID,
        "ContextCompressionMessageRetentionCount" = p_ContextCompressionMessageRetentionCount,
        "TypeID" = p_TypeID,
        "Status" = p_Status,
        "DriverClass" = p_DriverClass,
        "IconClass" = p_IconClass,
        "ModelSelectionMode" = p_ModelSelectionMode,
        "PayloadDownstreamPaths" = p_PayloadDownstreamPaths,
        "PayloadUpstreamPaths" = p_PayloadUpstreamPaths,
        "PayloadSelfReadPaths" = p_PayloadSelfReadPaths,
        "PayloadSelfWritePaths" = p_PayloadSelfWritePaths,
        "PayloadScope" = p_PayloadScope,
        "FinalPayloadValidation" = p_FinalPayloadValidation,
        "FinalPayloadValidationMode" = p_FinalPayloadValidationMode,
        "FinalPayloadValidationMaxRetries" = p_FinalPayloadValidationMaxRetries,
        "MaxCostPerRun" = p_MaxCostPerRun,
        "MaxTokensPerRun" = p_MaxTokensPerRun,
        "MaxIterationsPerRun" = p_MaxIterationsPerRun,
        "MaxTimePerRun" = p_MaxTimePerRun,
        "MinExecutionsPerRun" = p_MinExecutionsPerRun,
        "MaxExecutionsPerRun" = p_MaxExecutionsPerRun,
        "StartingPayloadValidation" = p_StartingPayloadValidation,
        "StartingPayloadValidationMode" = p_StartingPayloadValidationMode,
        "DefaultPromptEffortLevel" = p_DefaultPromptEffortLevel,
        "ChatHandlingOption" = p_ChatHandlingOption,
        "DefaultArtifactTypeID" = p_DefaultArtifactTypeID,
        "OwnerUserID" = p_OwnerUserID,
        "InvocationMode" = p_InvocationMode,
        "ArtifactCreationMode" = p_ArtifactCreationMode,
        "FunctionalRequirements" = p_FunctionalRequirements,
        "TechnicalDesign" = p_TechnicalDesign,
        "InjectNotes" = p_InjectNotes,
        "MaxNotesToInject" = p_MaxNotesToInject,
        "NoteInjectionStrategy" = p_NoteInjectionStrategy,
        "InjectExamples" = p_InjectExamples,
        "MaxExamplesToInject" = p_MaxExamplesToInject,
        "ExampleInjectionStrategy" = p_ExampleInjectionStrategy,
        "IsRestricted" = p_IsRestricted,
        "MessageMode" = p_MessageMode,
        "MaxMessages" = p_MaxMessages,
        "AttachmentStorageProviderID" = p_AttachmentStorageProviderID,
        "AttachmentRootPath" = p_AttachmentRootPath,
        "InlineStorageThresholdBytes" = p_InlineStorageThresholdBytes,
        "AgentTypePromptParams" = p_AgentTypePromptParams,
        "ScopeConfig" = p_ScopeConfig,
        "NoteRetentionDays" = p_NoteRetentionDays,
        "ExampleRetentionDays" = p_ExampleRetentionDays,
        "AutoArchiveEnabled" = p_AutoArchiveEnabled,
        "RerankerConfiguration" = p_RerankerConfiguration,
        "CategoryID" = p_CategoryID,
        "AllowEphemeralClientTools" = p_AllowEphemeralClientTools
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentActions_AgentIDID UUID;
    p_MJAIAgentActions_AgentID_AgentID UUID;
    p_MJAIAgentActions_AgentID_ActionID UUID;
    p_MJAIAgentActions_AgentID_Status VARCHAR(15);
    p_MJAIAgentActions_AgentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_AgentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_AgentID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_AgentID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_AgentID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_AgentID_CompactLength INTEGER;
    p_MJAIAgentActions_AgentID_CompactPromptID UUID;
    p_MJAIAgentArtifactTypes_AgentIDID UUID;
    p_MJAIAgentClientTools_AgentIDID UUID;
    p_MJAIAgentConfigurations_AgentIDID UUID;
    p_MJAIAgentDataSources_AgentIDID UUID;
    p_MJAIAgentExamples_AgentIDID UUID;
    p_MJAIAgentLearningCycles_AgentIDID UUID;
    p_MJAIAgentModalities_AgentIDID UUID;
    p_MJAIAgentModels_AgentIDID UUID;
    p_MJAIAgentModels_AgentID_AgentID UUID;
    p_MJAIAgentModels_AgentID_ModelID UUID;
    p_MJAIAgentModels_AgentID_Active BOOLEAN;
    p_MJAIAgentModels_AgentID_Priority INTEGER;
    p_MJAIAgentNotes_AgentIDID UUID;
    p_MJAIAgentNotes_AgentID_AgentID UUID;
    p_MJAIAgentNotes_AgentID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_AgentID_Note TEXT;
    p_MJAIAgentNotes_AgentID_UserID UUID;
    p_MJAIAgentNotes_AgentID_Type VARCHAR(20);
    p_MJAIAgentNotes_AgentID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_AgentID_Comments TEXT;
    p_MJAIAgentNotes_AgentID_Status VARCHAR(20);
    p_MJAIAgentNotes_AgentID_SourceConversationID UUID;
    p_MJAIAgentNotes_AgentID_SourceConversationDetailID UUID;
    p_MJAIAgentNotes_AgentID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_AgentID_CompanyID UUID;
    p_MJAIAgentNotes_AgentID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_AgentID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_AgentID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_AgentID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_AgentID_AccessCount INTEGER;
    p_MJAIAgentNotes_AgentID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentPermissions_AgentIDID UUID;
    p_MJAIAgentPrompts_AgentIDID UUID;
    p_MJAIAgentRelationships_AgentIDID UUID;
    p_MJAIAgentRelationships_SubAgentIDID UUID;
    p_MJAIAgentRequests_AgentIDID UUID;
    p_MJAIAgentRuns_AgentIDID UUID;
    p_MJAIAgentSteps_AgentIDID UUID;
    p_MJAIAgentSteps_SubAgentIDID UUID;
    p_MJAIAgentSteps_SubAgentID_AgentID UUID;
    p_MJAIAgentSteps_SubAgentID_Name VARCHAR(255);
    p_MJAIAgentSteps_SubAgentID_Description TEXT;
    p_MJAIAgentSteps_SubAgentID_StepType VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_SubAgentID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_SubAgentID_RetryCount INTEGER;
    p_MJAIAgentSteps_SubAgentID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_ActionID UUID;
    p_MJAIAgentSteps_SubAgentID_SubAgentID UUID;
    p_MJAIAgentSteps_SubAgentID_PromptID UUID;
    p_MJAIAgentSteps_SubAgentID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_SubAgentID_PositionX INTEGER;
    p_MJAIAgentSteps_SubAgentID_PositionY INTEGER;
    p_MJAIAgentSteps_SubAgentID_Width INTEGER;
    p_MJAIAgentSteps_SubAgentID_Height INTEGER;
    p_MJAIAgentSteps_SubAgentID_Status VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_SubAgentID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_SubAgentID_Configuration TEXT;
    p_MJAIAgents_ParentIDID UUID;
    p_MJAIAgents_ParentID_Name VARCHAR(255);
    p_MJAIAgents_ParentID_Description TEXT;
    p_MJAIAgents_ParentID_LogoURL VARCHAR(255);
    p_MJAIAgents_ParentID_ParentID UUID;
    p_MJAIAgents_ParentID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_ParentID_ExecutionOrder INTEGER;
    p_MJAIAgents_ParentID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_ParentID_EnableContextCompression BOOLEAN;
    p_MJAIAgents_ParentID_ContextCompressionMessageThreshold INTEGER;
    p_MJAIAgents_ParentID_ContextCompressionPromptID UUID;
    p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount INTEGER;
    p_MJAIAgents_ParentID_TypeID UUID;
    p_MJAIAgents_ParentID_Status VARCHAR(20);
    p_MJAIAgents_ParentID_DriverClass VARCHAR(255);
    p_MJAIAgents_ParentID_IconClass VARCHAR(100);
    p_MJAIAgents_ParentID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_ParentID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_ParentID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_ParentID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_ParentID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_ParentID_PayloadScope TEXT;
    p_MJAIAgents_ParentID_FinalPayloadValidation TEXT;
    p_MJAIAgents_ParentID_FinalPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries INTEGER;
    p_MJAIAgents_ParentID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_ParentID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxTimePerRun INTEGER;
    p_MJAIAgents_ParentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_ParentID_StartingPayloadValidation TEXT;
    p_MJAIAgents_ParentID_StartingPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_ParentID_DefaultPromptEffortLevel INTEGER;
    p_MJAIAgents_ParentID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_ParentID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_ParentID_OwnerUserID UUID;
    p_MJAIAgents_ParentID_InvocationMode VARCHAR(20);
    p_MJAIAgents_ParentID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_ParentID_FunctionalRequirements TEXT;
    p_MJAIAgents_ParentID_TechnicalDesign TEXT;
    p_MJAIAgents_ParentID_InjectNotes BOOLEAN;
    p_MJAIAgents_ParentID_MaxNotesToInject INTEGER;
    p_MJAIAgents_ParentID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ParentID_InjectExamples BOOLEAN;
    p_MJAIAgents_ParentID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_ParentID_ExampleInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ParentID_IsRestricted BOOLEAN;
    p_MJAIAgents_ParentID_MessageMode VARCHAR(50);
    p_MJAIAgents_ParentID_MaxMessages INTEGER;
    p_MJAIAgents_ParentID_AttachmentStorageProviderID UUID;
    p_MJAIAgents_ParentID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_ParentID_InlineStorageThresholdBytes INTEGER;
    p_MJAIAgents_ParentID_AgentTypePromptParams TEXT;
    p_MJAIAgents_ParentID_ScopeConfig TEXT;
    p_MJAIAgents_ParentID_NoteRetentionDays INTEGER;
    p_MJAIAgents_ParentID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_ParentID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_ParentID_RerankerConfiguration TEXT;
    p_MJAIAgents_ParentID_CategoryID UUID;
    p_MJAIAgents_ParentID_AllowEphemeralClientTools BOOLEAN;
    p_MJAIPromptRuns_AgentIDID UUID;
    p_MJAIPromptRuns_AgentID_PromptID UUID;
    p_MJAIPromptRuns_AgentID_ModelID UUID;
    p_MJAIPromptRuns_AgentID_VendorID UUID;
    p_MJAIPromptRuns_AgentID_AgentID UUID;
    p_MJAIPromptRuns_AgentID_ConfigurationID UUID;
    p_MJAIPromptRuns_AgentID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_AgentID_Messages TEXT;
    p_MJAIPromptRuns_AgentID_Result TEXT;
    p_MJAIPromptRuns_AgentID_TokensUsed INTEGER;
    p_MJAIPromptRuns_AgentID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_AgentID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentID_Success BOOLEAN;
    p_MJAIPromptRuns_AgentID_ErrorMessage TEXT;
    p_MJAIPromptRuns_AgentID_ParentID UUID;
    p_MJAIPromptRuns_AgentID_RunType VARCHAR(20);
    p_MJAIPromptRuns_AgentID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_AgentID_AgentRunID UUID;
    p_MJAIPromptRuns_AgentID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_AgentID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_AgentID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_AgentID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_TopK INTEGER;
    p_MJAIPromptRuns_AgentID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_Seed INTEGER;
    p_MJAIPromptRuns_AgentID_StopSequences TEXT;
    p_MJAIPromptRuns_AgentID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_AgentID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_AgentID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_AgentID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_AgentID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_AgentID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_AgentID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_AgentID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_AgentID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_AgentID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_AgentID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_AgentID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_AgentID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_AgentID_ValidationSummary TEXT;
    p_MJAIPromptRuns_AgentID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_AgentID_FailoverErrors TEXT;
    p_MJAIPromptRuns_AgentID_FailoverDurations TEXT;
    p_MJAIPromptRuns_AgentID_OriginalModelID UUID;
    p_MJAIPromptRuns_AgentID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_AgentID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_AgentID_ModelSelection TEXT;
    p_MJAIPromptRuns_AgentID_Status VARCHAR(50);
    p_MJAIPromptRuns_AgentID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_AgentID_CancellationReason TEXT;
    p_MJAIPromptRuns_AgentID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_AgentID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_AgentID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_AgentID_JudgeID UUID;
    p_MJAIPromptRuns_AgentID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_AgentID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_AgentID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_AgentID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_AgentID_ErrorDetails TEXT;
    p_MJAIPromptRuns_AgentID_ChildPromptID UUID;
    p_MJAIPromptRuns_AgentID_QueueTime INTEGER;
    p_MJAIPromptRuns_AgentID_PromptTime INTEGER;
    p_MJAIPromptRuns_AgentID_CompletionTime INTEGER;
    p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_AgentID_EffortLevel INTEGER;
    p_MJAIPromptRuns_AgentID_RunName VARCHAR(255);
    p_MJAIPromptRuns_AgentID_Comments TEXT;
    p_MJAIPromptRuns_AgentID_TestRunID UUID;
    p_MJAIPromptRuns_AgentID_AssistantPrefill TEXT;
    p_MJAIResultCache_AgentIDID UUID;
    p_MJAIResultCache_AgentID_AIPromptID UUID;
    p_MJAIResultCache_AgentID_AIModelID UUID;
    p_MJAIResultCache_AgentID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_AgentID_PromptText TEXT;
    p_MJAIResultCache_AgentID_ResultText TEXT;
    p_MJAIResultCache_AgentID_Status VARCHAR(50);
    p_MJAIResultCache_AgentID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_AgentID_VendorID UUID;
    p_MJAIResultCache_AgentID_AgentID UUID;
    p_MJAIResultCache_AgentID_ConfigurationID UUID;
    p_MJAIResultCache_AgentID_PromptEmbedding BYTEA;
    p_MJAIResultCache_AgentID_PromptRunID UUID;
    p_MJConversationDetails_AgentIDID UUID;
    p_MJConversationDetails_AgentID_ConversationID UUID;
    p_MJConversationDetails_AgentID_ExternalID VARCHAR(100);
    p_MJConversationDetails_AgentID_Role VARCHAR(20);
    p_MJConversationDetails_AgentID_Message TEXT;
    p_MJConversationDetails_AgentID_Error TEXT;
    p_MJConversationDetails_AgentID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_AgentID_UserRating INTEGER;
    p_MJConversationDetails_AgentID_UserFeedback TEXT;
    p_MJConversationDetails_AgentID_ReflectionInsights TEXT;
    p_MJConversationDetails_AgentID_SummaryOfEarlierConversation TEXT;
    p_MJConversationDetails_AgentID_UserID UUID;
    p_MJConversationDetails_AgentID_ArtifactID UUID;
    p_MJConversationDetails_AgentID_ArtifactVersionID UUID;
    p_MJConversationDetails_AgentID_CompletionTime BIGINT;
    p_MJConversationDetails_AgentID_IsPinned BOOLEAN;
    p_MJConversationDetails_AgentID_ParentID UUID;
    p_MJConversationDetails_AgentID_AgentID UUID;
    p_MJConversationDetails_AgentID_Status VARCHAR(20);
    p_MJConversationDetails_AgentID_SuggestedResponses TEXT;
    p_MJConversationDetails_AgentID_TestRunID UUID;
    p_MJConversationDetails_AgentID_ResponseForm TEXT;
    p_MJConversationDetails_AgentID_ActionableCommands TEXT;
    p_MJConversationDetails_AgentID_AutomaticCommands TEXT;
    p_MJConversationDetails_AgentID_OriginalMessageChanged BOOLEAN;
    p_MJTasks_AgentIDID UUID;
    p_MJTasks_AgentID_ParentID UUID;
    p_MJTasks_AgentID_Name VARCHAR(255);
    p_MJTasks_AgentID_Description TEXT;
    p_MJTasks_AgentID_TypeID UUID;
    p_MJTasks_AgentID_EnvironmentID UUID;
    p_MJTasks_AgentID_ProjectID UUID;
    p_MJTasks_AgentID_ConversationDetailID UUID;
    p_MJTasks_AgentID_UserID UUID;
    p_MJTasks_AgentID_AgentID UUID;
    p_MJTasks_AgentID_Status VARCHAR(50);
    p_MJTasks_AgentID_PercentComplete INTEGER;
    p_MJTasks_AgentID_DueAt TIMESTAMPTZ;
    p_MJTasks_AgentID_StartedAt TIMESTAMPTZ;
    p_MJTasks_AgentID_CompletedAt TIMESTAMPTZ;
BEGIN
-- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentActions_AgentIDID := _rec."ID";
        p_MJAIAgentActions_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_AgentID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_AgentID_Status := _rec."Status";
        p_MJAIAgentActions_AgentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_AgentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_AgentID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_AgentID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_AgentID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_AgentID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_AgentID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_MJAIAgentActions_AgentIDID, p_MJAIAgentActions_AgentID_AgentID, p_MJAIAgentActions_AgentID_ActionID, p_MJAIAgentActions_AgentID_Status, p_MJAIAgentActions_AgentID_MinExecutionsPerRun, p_MJAIAgentActions_AgentID_MaxExecutionsPerRun, p_MJAIAgentActions_AgentID_ResultExpirationTurns, p_MJAIAgentActions_AgentID_ResultExpirationMode, p_MJAIAgentActions_AgentID_CompactMode, p_MJAIAgentActions_AgentID_CompactLength, p_MJAIAgentActions_AgentID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentArtifactType" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentArtifactTypes_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentArtifactType"(p_MJAIAgentArtifactTypes_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentClientTool" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentClientTools_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentClientTool"(p_MJAIAgentClientTools_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentConfiguration" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentConfigurations_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentConfiguration"(p_MJAIAgentConfigurations_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentDataSource" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentDataSources_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentDataSource"(p_MJAIAgentDataSources_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentExample" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentExamples_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentExample"(p_MJAIAgentExamples_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentLearningCycle" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentLearningCycles_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentLearningCycle"(p_MJAIAgentLearningCycles_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentModality" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentModalities_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentModality"(p_MJAIAgentModalities_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel


    FOR _rec IN SELECT "ID", "AgentID", "ModelID", "Active", "Priority" FROM __mj."AIAgentModel" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentModels_AgentIDID := _rec."ID";
        p_MJAIAgentModels_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentModels_AgentID_ModelID := _rec."ModelID";
        p_MJAIAgentModels_AgentID_Active := _rec."Active";
        p_MJAIAgentModels_AgentID_Priority := _rec."Priority";
        -- Set the FK field to NULL
        p_MJAIAgentModels_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentModel"(p_MJAIAgentModels_AgentIDID, p_MJAIAgentModels_AgentID_AgentID, p_MJAIAgentModels_AgentID_ModelID, p_MJAIAgentModels_AgentID_Active, p_MJAIAgentModels_AgentID_Priority);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentNote" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentNotes_AgentIDID := _rec."ID";
        p_MJAIAgentNotes_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_AgentID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_AgentID_Note := _rec."Note";
        p_MJAIAgentNotes_AgentID_UserID := _rec."UserID";
        p_MJAIAgentNotes_AgentID_Type := _rec."Type";
        p_MJAIAgentNotes_AgentID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_AgentID_Comments := _rec."Comments";
        p_MJAIAgentNotes_AgentID_Status := _rec."Status";
        p_MJAIAgentNotes_AgentID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_AgentID_SourceConversationDetailID := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_AgentID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_AgentID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_AgentID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_AgentID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_AgentID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_AgentID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_AgentID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_AgentID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_MJAIAgentNotes_AgentIDID, p_MJAIAgentNotes_AgentID_AgentID, p_MJAIAgentNotes_AgentID_AgentNoteTypeID, p_MJAIAgentNotes_AgentID_Note, p_MJAIAgentNotes_AgentID_UserID, p_MJAIAgentNotes_AgentID_Type, p_MJAIAgentNotes_AgentID_IsAutoGenerated, p_MJAIAgentNotes_AgentID_Comments, p_MJAIAgentNotes_AgentID_Status, p_MJAIAgentNotes_AgentID_SourceConversationID, p_MJAIAgentNotes_AgentID_SourceConversationDetailID, p_MJAIAgentNotes_AgentID_SourceAIAgentRunID, p_MJAIAgentNotes_AgentID_CompanyID, p_MJAIAgentNotes_AgentID_EmbeddingVector, p_MJAIAgentNotes_AgentID_EmbeddingModelID, p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID, p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID, p_MJAIAgentNotes_AgentID_SecondaryScopes, p_MJAIAgentNotes_AgentID_LastAccessedAt, p_MJAIAgentNotes_AgentID_AccessCount, p_MJAIAgentNotes_AgentID_ExpiresAt);

    END LOOP;

    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPermission" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPermissions_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPermission"(p_MJAIAgentPermissions_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPrompts_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_MJAIAgentPrompts_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_MJAIAgentRelationships_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_SubAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_MJAIAgentRelationships_SubAgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRequest" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRequests_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRequest"(p_MJAIAgentRequests_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRun" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRuns_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRun"(p_MJAIAgentRuns_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentStep" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSteps_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentStep"(p_MJAIAgentSteps_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAIAgentSteps_SubAgentIDID := _rec."ID";
        p_MJAIAgentSteps_SubAgentID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_SubAgentID_Name := _rec."Name";
        p_MJAIAgentSteps_SubAgentID_Description := _rec."Description";
        p_MJAIAgentSteps_SubAgentID_StepType := _rec."StepType";
        p_MJAIAgentSteps_SubAgentID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_SubAgentID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_SubAgentID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_SubAgentID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_SubAgentID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_SubAgentID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_SubAgentID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_SubAgentID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_SubAgentID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_SubAgentID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_SubAgentID_Width := _rec."Width";
        p_MJAIAgentSteps_SubAgentID_Height := _rec."Height";
        p_MJAIAgentSteps_SubAgentID_Status := _rec."Status";
        p_MJAIAgentSteps_SubAgentID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_SubAgentID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_SubAgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_SubAgentID_SubAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_MJAIAgentSteps_SubAgentIDID, p_MJAIAgentSteps_SubAgentID_AgentID, p_MJAIAgentSteps_SubAgentID_Name, p_MJAIAgentSteps_SubAgentID_Description, p_MJAIAgentSteps_SubAgentID_StepType, p_MJAIAgentSteps_SubAgentID_StartingStep, p_MJAIAgentSteps_SubAgentID_TimeoutSeconds, p_MJAIAgentSteps_SubAgentID_RetryCount, p_MJAIAgentSteps_SubAgentID_OnErrorBehavior, p_MJAIAgentSteps_SubAgentID_ActionID, p_MJAIAgentSteps_SubAgentID_SubAgentID, p_MJAIAgentSteps_SubAgentID_PromptID, p_MJAIAgentSteps_SubAgentID_ActionOutputMapping, p_MJAIAgentSteps_SubAgentID_PositionX, p_MJAIAgentSteps_SubAgentID_PositionY, p_MJAIAgentSteps_SubAgentID_Width, p_MJAIAgentSteps_SubAgentID_Height, p_MJAIAgentSteps_SubAgentID_Status, p_MJAIAgentSteps_SubAgentID_ActionInputMapping, p_MJAIAgentSteps_SubAgentID_LoopBodyType, p_MJAIAgentSteps_SubAgentID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIAgents_ParentIDID := _rec."ID";
        p_MJAIAgents_ParentID_Name := _rec."Name";
        p_MJAIAgents_ParentID_Description := _rec."Description";
        p_MJAIAgents_ParentID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_ParentID_ParentID := _rec."ParentID";
        p_MJAIAgents_ParentID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_ParentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_ParentID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_ParentID_EnableContextCompression := _rec."EnableContextCompression";
        p_MJAIAgents_ParentID_ContextCompressionMessageThreshold := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_ParentID_ContextCompressionPromptID := _rec."ContextCompressionPromptID";
        p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_ParentID_TypeID := _rec."TypeID";
        p_MJAIAgents_ParentID_Status := _rec."Status";
        p_MJAIAgents_ParentID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_ParentID_IconClass := _rec."IconClass";
        p_MJAIAgents_ParentID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_ParentID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_ParentID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_ParentID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_ParentID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_ParentID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_ParentID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_ParentID_FinalPayloadValidationMode := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_ParentID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_ParentID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_ParentID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_ParentID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_ParentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_ParentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_ParentID_StartingPayloadValidation := _rec."StartingPayloadValidation";
        p_MJAIAgents_ParentID_StartingPayloadValidationMode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_ParentID_DefaultPromptEffortLevel := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_ParentID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_ParentID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_ParentID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_ParentID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_ParentID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_ParentID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_ParentID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_ParentID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_ParentID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_ParentID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_ParentID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_ParentID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_ParentID_ExampleInjectionStrategy := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_ParentID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_ParentID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_ParentID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_ParentID_AttachmentStorageProviderID := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_ParentID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_ParentID_InlineStorageThresholdBytes := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_ParentID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_ParentID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_ParentID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_ParentID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_ParentID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_ParentID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_ParentID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_ParentID_AllowEphemeralClientTools := _rec."AllowEphemeralClientTools";
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_MJAIAgents_ParentIDID, p_MJAIAgents_ParentID_Name, p_MJAIAgents_ParentID_Description, p_MJAIAgents_ParentID_LogoURL, p_MJAIAgents_ParentID_ParentID, p_MJAIAgents_ParentID_ExposeAsAction, p_MJAIAgents_ParentID_ExecutionOrder, p_MJAIAgents_ParentID_ExecutionMode, p_MJAIAgents_ParentID_EnableContextCompression, p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_MJAIAgents_ParentID_ContextCompressionPromptID, p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_MJAIAgents_ParentID_TypeID, p_MJAIAgents_ParentID_Status, p_MJAIAgents_ParentID_DriverClass, p_MJAIAgents_ParentID_IconClass, p_MJAIAgents_ParentID_ModelSelectionMode, p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_MJAIAgents_ParentID_PayloadScope, p_MJAIAgents_ParentID_FinalPayloadValidation, p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MJAIAgents_ParentID_MaxCostPerRun, p_MJAIAgents_ParentID_MaxTokensPerRun, p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MJAIAgents_ParentID_MaxTimePerRun, p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_MJAIAgents_ParentID_StartingPayloadValidation, p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_MJAIAgents_ParentID_ChatHandlingOption, p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_MJAIAgents_ParentID_OwnerUserID, p_MJAIAgents_ParentID_InvocationMode, p_MJAIAgents_ParentID_ArtifactCreationMode, p_MJAIAgents_ParentID_FunctionalRequirements, p_MJAIAgents_ParentID_TechnicalDesign, p_MJAIAgents_ParentID_InjectNotes, p_MJAIAgents_ParentID_MaxNotesToInject, p_MJAIAgents_ParentID_NoteInjectionStrategy, p_MJAIAgents_ParentID_InjectExamples, p_MJAIAgents_ParentID_MaxExamplesToInject, p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_MJAIAgents_ParentID_IsRestricted, p_MJAIAgents_ParentID_MessageMode, p_MJAIAgents_ParentID_MaxMessages, p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_MJAIAgents_ParentID_AttachmentRootPath, p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_MJAIAgents_ParentID_AgentTypePromptParams, p_MJAIAgents_ParentID_ScopeConfig, p_MJAIAgents_ParentID_NoteRetentionDays, p_MJAIAgents_ParentID_ExampleRetentionDays, p_MJAIAgents_ParentID_AutoArchiveEnabled, p_MJAIAgents_ParentID_RerankerConfiguration, p_MJAIAgents_ParentID_CategoryID, p_MJAIAgents_ParentID_AllowEphemeralClientTools);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIPromptRuns_AgentIDID := _rec."ID";
        p_MJAIPromptRuns_AgentID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_AgentID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_AgentID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_AgentID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_AgentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_AgentID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_AgentID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_AgentID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_AgentID_Messages := _rec."Messages";
        p_MJAIPromptRuns_AgentID_Result := _rec."Result";
        p_MJAIPromptRuns_AgentID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_AgentID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_AgentID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_AgentID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_AgentID_Success := _rec."Success";
        p_MJAIPromptRuns_AgentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_AgentID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_AgentID_RunType := _rec."RunType";
        p_MJAIPromptRuns_AgentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_AgentID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_AgentID_Cost := _rec."Cost";
        p_MJAIPromptRuns_AgentID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_AgentID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_AgentID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_AgentID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_AgentID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_AgentID_TopP := _rec."TopP";
        p_MJAIPromptRuns_AgentID_TopK := _rec."TopK";
        p_MJAIPromptRuns_AgentID_MinP := _rec."MinP";
        p_MJAIPromptRuns_AgentID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_AgentID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_AgentID_Seed := _rec."Seed";
        p_MJAIPromptRuns_AgentID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_AgentID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_AgentID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_AgentID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_AgentID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_AgentID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_AgentID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_AgentID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_AgentID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_AgentID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_AgentID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_AgentID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_AgentID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_AgentID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_AgentID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_AgentID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_AgentID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_AgentID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_AgentID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_AgentID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_AgentID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_AgentID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_AgentID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_AgentID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_AgentID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_AgentID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_AgentID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_AgentID_Status := _rec."Status";
        p_MJAIPromptRuns_AgentID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_AgentID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_AgentID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_AgentID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_AgentID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_AgentID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_AgentID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_AgentID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_AgentID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_AgentID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_AgentID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_AgentID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_AgentID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_AgentID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_AgentID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_AgentID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_AgentID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_AgentID_RunName := _rec."RunName";
        p_MJAIPromptRuns_AgentID_Comments := _rec."Comments";
        p_MJAIPromptRuns_AgentID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_AgentID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_AgentIDID, p_MJAIPromptRuns_AgentID_PromptID, p_MJAIPromptRuns_AgentID_ModelID, p_MJAIPromptRuns_AgentID_VendorID, p_MJAIPromptRuns_AgentID_AgentID, p_MJAIPromptRuns_AgentID_ConfigurationID, p_MJAIPromptRuns_AgentID_RunAt, p_MJAIPromptRuns_AgentID_CompletedAt, p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_MJAIPromptRuns_AgentID_Messages, p_MJAIPromptRuns_AgentID_Result, p_MJAIPromptRuns_AgentID_TokensUsed, p_MJAIPromptRuns_AgentID_TokensPrompt, p_MJAIPromptRuns_AgentID_TokensCompletion, p_MJAIPromptRuns_AgentID_TotalCost, p_MJAIPromptRuns_AgentID_Success, p_MJAIPromptRuns_AgentID_ErrorMessage, p_MJAIPromptRuns_AgentID_ParentID, p_MJAIPromptRuns_AgentID_RunType, p_MJAIPromptRuns_AgentID_ExecutionOrder, p_MJAIPromptRuns_AgentID_AgentRunID, p_MJAIPromptRuns_AgentID_Cost, p_MJAIPromptRuns_AgentID_CostCurrency, p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_MJAIPromptRuns_AgentID_Temperature, p_MJAIPromptRuns_AgentID_TopP, p_MJAIPromptRuns_AgentID_TopK, p_MJAIPromptRuns_AgentID_MinP, p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_MJAIPromptRuns_AgentID_PresencePenalty, p_MJAIPromptRuns_AgentID_Seed, p_MJAIPromptRuns_AgentID_StopSequences, p_MJAIPromptRuns_AgentID_ResponseFormat, p_MJAIPromptRuns_AgentID_LogProbs, p_MJAIPromptRuns_AgentID_TopLogProbs, p_MJAIPromptRuns_AgentID_DescendantCost, p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_MJAIPromptRuns_AgentID_ValidationBehavior, p_MJAIPromptRuns_AgentID_RetryStrategy, p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_MJAIPromptRuns_AgentID_FinalValidationError, p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_MJAIPromptRuns_AgentID_CommonValidationError, p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_MJAIPromptRuns_AgentID_LastAttemptAt, p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_MJAIPromptRuns_AgentID_ValidationAttempts, p_MJAIPromptRuns_AgentID_ValidationSummary, p_MJAIPromptRuns_AgentID_FailoverAttempts, p_MJAIPromptRuns_AgentID_FailoverErrors, p_MJAIPromptRuns_AgentID_FailoverDurations, p_MJAIPromptRuns_AgentID_OriginalModelID, p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_MJAIPromptRuns_AgentID_ModelSelection, p_MJAIPromptRuns_AgentID_Status, p_MJAIPromptRuns_AgentID_Cancelled, p_MJAIPromptRuns_AgentID_CancellationReason, p_MJAIPromptRuns_AgentID_ModelPowerRank, p_MJAIPromptRuns_AgentID_SelectionStrategy, p_MJAIPromptRuns_AgentID_CacheHit, p_MJAIPromptRuns_AgentID_CacheKey, p_MJAIPromptRuns_AgentID_JudgeID, p_MJAIPromptRuns_AgentID_JudgeScore, p_MJAIPromptRuns_AgentID_WasSelectedResult, p_MJAIPromptRuns_AgentID_StreamingEnabled, p_MJAIPromptRuns_AgentID_FirstTokenTime, p_MJAIPromptRuns_AgentID_ErrorDetails, p_MJAIPromptRuns_AgentID_ChildPromptID, p_MJAIPromptRuns_AgentID_QueueTime, p_MJAIPromptRuns_AgentID_PromptTime, p_MJAIPromptRuns_AgentID_CompletionTime, p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_MJAIPromptRuns_AgentID_EffortLevel, p_MJAIPromptRuns_AgentID_RunName, p_MJAIPromptRuns_AgentID_Comments, p_MJAIPromptRuns_AgentID_TestRunID, p_MJAIPromptRuns_AgentID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIResultCache_AgentIDID := _rec."ID";
        p_MJAIResultCache_AgentID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_AgentID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_AgentID_RunAt := _rec."RunAt";
        p_MJAIResultCache_AgentID_PromptText := _rec."PromptText";
        p_MJAIResultCache_AgentID_ResultText := _rec."ResultText";
        p_MJAIResultCache_AgentID_Status := _rec."Status";
        p_MJAIResultCache_AgentID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_AgentID_VendorID := _rec."VendorID";
        p_MJAIResultCache_AgentID_AgentID := _rec."AgentID";
        p_MJAIResultCache_AgentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_AgentID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_AgentID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_MJAIResultCache_AgentIDID, p_MJAIResultCache_AgentID_AIPromptID, p_MJAIResultCache_AgentID_AIModelID, p_MJAIResultCache_AgentID_RunAt, p_MJAIResultCache_AgentID_PromptText, p_MJAIResultCache_AgentID_ResultText, p_MJAIResultCache_AgentID_Status, p_MJAIResultCache_AgentID_ExpiredOn, p_MJAIResultCache_AgentID_VendorID, p_MJAIResultCache_AgentID_AgentID, p_MJAIResultCache_AgentID_ConfigurationID, p_MJAIResultCache_AgentID_PromptEmbedding, p_MJAIResultCache_AgentID_PromptRunID);

    END LOOP;

    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged" FROM __mj."ConversationDetail" WHERE "AgentID" = p_ID
    LOOP
        p_MJConversationDetails_AgentIDID := _rec."ID";
        p_MJConversationDetails_AgentID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_AgentID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_AgentID_Role := _rec."Role";
        p_MJConversationDetails_AgentID_Message := _rec."Message";
        p_MJConversationDetails_AgentID_Error := _rec."Error";
        p_MJConversationDetails_AgentID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_AgentID_UserRating := _rec."UserRating";
        p_MJConversationDetails_AgentID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_AgentID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_AgentID_SummaryOfEarlierConversation := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_AgentID_UserID := _rec."UserID";
        p_MJConversationDetails_AgentID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_AgentID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_AgentID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_AgentID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_AgentID_ParentID := _rec."ParentID";
        p_MJConversationDetails_AgentID_AgentID := _rec."AgentID";
        p_MJConversationDetails_AgentID_Status := _rec."Status";
        p_MJConversationDetails_AgentID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_AgentID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_AgentID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_AgentID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_AgentID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_AgentID_OriginalMessageChanged := _rec."OriginalMessageChanged";
        -- Set the FK field to NULL
        p_MJConversationDetails_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_MJConversationDetails_AgentIDID, p_MJConversationDetails_AgentID_ConversationID, p_MJConversationDetails_AgentID_ExternalID, p_MJConversationDetails_AgentID_Role, p_MJConversationDetails_AgentID_Message, p_MJConversationDetails_AgentID_Error, p_MJConversationDetails_AgentID_HiddenToUser, p_MJConversationDetails_AgentID_UserRating, p_MJConversationDetails_AgentID_UserFeedback, p_MJConversationDetails_AgentID_ReflectionInsights, p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_MJConversationDetails_AgentID_UserID, p_MJConversationDetails_AgentID_ArtifactID, p_MJConversationDetails_AgentID_ArtifactVersionID, p_MJConversationDetails_AgentID_CompletionTime, p_MJConversationDetails_AgentID_IsPinned, p_MJConversationDetails_AgentID_ParentID, p_MJConversationDetails_AgentID_AgentID, p_MJConversationDetails_AgentID_Status, p_MJConversationDetails_AgentID_SuggestedResponses, p_MJConversationDetails_AgentID_TestRunID, p_MJConversationDetails_AgentID_ResponseForm, p_MJConversationDetails_AgentID_ActionableCommands, p_MJConversationDetails_AgentID_AutomaticCommands, p_MJConversationDetails_AgentID_OriginalMessageChanged);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt" FROM __mj."Task" WHERE "AgentID" = p_ID
    LOOP
        p_MJTasks_AgentIDID := _rec."ID";
        p_MJTasks_AgentID_ParentID := _rec."ParentID";
        p_MJTasks_AgentID_Name := _rec."Name";
        p_MJTasks_AgentID_Description := _rec."Description";
        p_MJTasks_AgentID_TypeID := _rec."TypeID";
        p_MJTasks_AgentID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_AgentID_ProjectID := _rec."ProjectID";
        p_MJTasks_AgentID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_AgentID_UserID := _rec."UserID";
        p_MJTasks_AgentID_AgentID := _rec."AgentID";
        p_MJTasks_AgentID_Status := _rec."Status";
        p_MJTasks_AgentID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_AgentID_DueAt := _rec."DueAt";
        p_MJTasks_AgentID_StartedAt := _rec."StartedAt";
        p_MJTasks_AgentID_CompletedAt := _rec."CompletedAt";
        -- Set the FK field to NULL
        p_MJTasks_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_MJTasks_AgentIDID, p_MJTasks_AgentID_ParentID, p_MJTasks_AgentID_Name, p_MJTasks_AgentID_Description, p_MJTasks_AgentID_TypeID, p_MJTasks_AgentID_EnvironmentID, p_MJTasks_AgentID_ProjectID, p_MJTasks_AgentID_ConversationDetailID, p_MJTasks_AgentID_UserID, p_MJTasks_AgentID_AgentID, p_MJTasks_AgentID_Status, p_MJTasks_AgentID_PercentComplete, p_MJTasks_AgentID_DueAt, p_MJTasks_AgentID_StartedAt, p_MJTasks_AgentID_CompletedAt);

    END LOOP;

    

    DELETE FROM
        __mj."AIAgent"
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
    p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b BOOLEAN;
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
    p_MJAIPromptRuns_JudgeID_AssistantPrefill TEXT;
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
    p_MJAIPromptRuns_ChildPromptID_AssistantPrefill TEXT;
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
    p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels BOOLEAN;
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


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools" FROM __mj."AIAgent" WHERE "ContextCompressionPromptID" = p_ID
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
        p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b := _rec."AllowEphemeralClientTools";
        -- Set the FK field to NULL
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_MJAIAgents_ContextCompressionPromptIDID, p_MJAIAgents_ContextCompressionPromptID_Name, p_MJAIAgents_ContextCompressionPromptID_Description, p_MJAIAgents_ContextCompressionPromptID_LogoURL, p_MJAIAgents_ContextCompressionPromptID_ParentID, p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction, p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder, p_MJAIAgents_ContextCompressionPromptID_ExecutionMode, p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508, p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d, p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d, p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1, p_MJAIAgents_ContextCompressionPromptID_TypeID, p_MJAIAgents_ContextCompressionPromptID_Status, p_MJAIAgents_ContextCompressionPromptID_DriverClass, p_MJAIAgents_ContextCompressionPromptID_IconClass, p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, p_MJAIAgents_ContextCompressionPromptID_PayloadScope, p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211, p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251, p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60, p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode, p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203, p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, p_MJAIAgents_ContextCompressionPromptID_OwnerUserID, p_MJAIAgents_ContextCompressionPromptID_InvocationMode, p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign, p_MJAIAgents_ContextCompressionPromptID_InjectNotes, p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, p_MJAIAgents_ContextCompressionPromptID_InjectExamples, p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212, p_MJAIAgents_ContextCompressionPromptID_IsRestricted, p_MJAIAgents_ContextCompressionPromptID_MessageMode, p_MJAIAgents_ContextCompressionPromptID_MaxMessages, p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf, p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef, p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, p_MJAIAgents_ContextCompressionPromptID_ScopeConfig, p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, p_MJAIAgents_ContextCompressionPromptID_CategoryID, p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b);

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


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "JudgeID" = p_ID
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
        p_MJAIPromptRuns_JudgeID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_JudgeID_JudgeID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_JudgeIDID, p_MJAIPromptRuns_JudgeID_PromptID, p_MJAIPromptRuns_JudgeID_ModelID, p_MJAIPromptRuns_JudgeID_VendorID, p_MJAIPromptRuns_JudgeID_AgentID, p_MJAIPromptRuns_JudgeID_ConfigurationID, p_MJAIPromptRuns_JudgeID_RunAt, p_MJAIPromptRuns_JudgeID_CompletedAt, p_MJAIPromptRuns_JudgeID_ExecutionTimeMS, p_MJAIPromptRuns_JudgeID_Messages, p_MJAIPromptRuns_JudgeID_Result, p_MJAIPromptRuns_JudgeID_TokensUsed, p_MJAIPromptRuns_JudgeID_TokensPrompt, p_MJAIPromptRuns_JudgeID_TokensCompletion, p_MJAIPromptRuns_JudgeID_TotalCost, p_MJAIPromptRuns_JudgeID_Success, p_MJAIPromptRuns_JudgeID_ErrorMessage, p_MJAIPromptRuns_JudgeID_ParentID, p_MJAIPromptRuns_JudgeID_RunType, p_MJAIPromptRuns_JudgeID_ExecutionOrder, p_MJAIPromptRuns_JudgeID_AgentRunID, p_MJAIPromptRuns_JudgeID_Cost, p_MJAIPromptRuns_JudgeID_CostCurrency, p_MJAIPromptRuns_JudgeID_TokensUsedRollup, p_MJAIPromptRuns_JudgeID_TokensPromptRollup, p_MJAIPromptRuns_JudgeID_TokensCompletionRollup, p_MJAIPromptRuns_JudgeID_Temperature, p_MJAIPromptRuns_JudgeID_TopP, p_MJAIPromptRuns_JudgeID_TopK, p_MJAIPromptRuns_JudgeID_MinP, p_MJAIPromptRuns_JudgeID_FrequencyPenalty, p_MJAIPromptRuns_JudgeID_PresencePenalty, p_MJAIPromptRuns_JudgeID_Seed, p_MJAIPromptRuns_JudgeID_StopSequences, p_MJAIPromptRuns_JudgeID_ResponseFormat, p_MJAIPromptRuns_JudgeID_LogProbs, p_MJAIPromptRuns_JudgeID_TopLogProbs, p_MJAIPromptRuns_JudgeID_DescendantCost, p_MJAIPromptRuns_JudgeID_ValidationAttemptCount, p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount, p_MJAIPromptRuns_JudgeID_FinalValidationPassed, p_MJAIPromptRuns_JudgeID_ValidationBehavior, p_MJAIPromptRuns_JudgeID_RetryStrategy, p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured, p_MJAIPromptRuns_JudgeID_FinalValidationError, p_MJAIPromptRuns_JudgeID_ValidationErrorCount, p_MJAIPromptRuns_JudgeID_CommonValidationError, p_MJAIPromptRuns_JudgeID_FirstAttemptAt, p_MJAIPromptRuns_JudgeID_LastAttemptAt, p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS, p_MJAIPromptRuns_JudgeID_ValidationAttempts, p_MJAIPromptRuns_JudgeID_ValidationSummary, p_MJAIPromptRuns_JudgeID_FailoverAttempts, p_MJAIPromptRuns_JudgeID_FailoverErrors, p_MJAIPromptRuns_JudgeID_FailoverDurations, p_MJAIPromptRuns_JudgeID_OriginalModelID, p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime, p_MJAIPromptRuns_JudgeID_TotalFailoverDuration, p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID, p_MJAIPromptRuns_JudgeID_ModelSelection, p_MJAIPromptRuns_JudgeID_Status, p_MJAIPromptRuns_JudgeID_Cancelled, p_MJAIPromptRuns_JudgeID_CancellationReason, p_MJAIPromptRuns_JudgeID_ModelPowerRank, p_MJAIPromptRuns_JudgeID_SelectionStrategy, p_MJAIPromptRuns_JudgeID_CacheHit, p_MJAIPromptRuns_JudgeID_CacheKey, p_MJAIPromptRuns_JudgeID_JudgeID, p_MJAIPromptRuns_JudgeID_JudgeScore, p_MJAIPromptRuns_JudgeID_WasSelectedResult, p_MJAIPromptRuns_JudgeID_StreamingEnabled, p_MJAIPromptRuns_JudgeID_FirstTokenTime, p_MJAIPromptRuns_JudgeID_ErrorDetails, p_MJAIPromptRuns_JudgeID_ChildPromptID, p_MJAIPromptRuns_JudgeID_QueueTime, p_MJAIPromptRuns_JudgeID_PromptTime, p_MJAIPromptRuns_JudgeID_CompletionTime, p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, p_MJAIPromptRuns_JudgeID_EffortLevel, p_MJAIPromptRuns_JudgeID_RunName, p_MJAIPromptRuns_JudgeID_Comments, p_MJAIPromptRuns_JudgeID_TestRunID, p_MJAIPromptRuns_JudgeID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "ChildPromptID" = p_ID
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
        p_MJAIPromptRuns_ChildPromptID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_ChildPromptIDID, p_MJAIPromptRuns_ChildPromptID_PromptID, p_MJAIPromptRuns_ChildPromptID_ModelID, p_MJAIPromptRuns_ChildPromptID_VendorID, p_MJAIPromptRuns_ChildPromptID_AgentID, p_MJAIPromptRuns_ChildPromptID_ConfigurationID, p_MJAIPromptRuns_ChildPromptID_RunAt, p_MJAIPromptRuns_ChildPromptID_CompletedAt, p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, p_MJAIPromptRuns_ChildPromptID_Messages, p_MJAIPromptRuns_ChildPromptID_Result, p_MJAIPromptRuns_ChildPromptID_TokensUsed, p_MJAIPromptRuns_ChildPromptID_TokensPrompt, p_MJAIPromptRuns_ChildPromptID_TokensCompletion, p_MJAIPromptRuns_ChildPromptID_TotalCost, p_MJAIPromptRuns_ChildPromptID_Success, p_MJAIPromptRuns_ChildPromptID_ErrorMessage, p_MJAIPromptRuns_ChildPromptID_ParentID, p_MJAIPromptRuns_ChildPromptID_RunType, p_MJAIPromptRuns_ChildPromptID_ExecutionOrder, p_MJAIPromptRuns_ChildPromptID_AgentRunID, p_MJAIPromptRuns_ChildPromptID_Cost, p_MJAIPromptRuns_ChildPromptID_CostCurrency, p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup, p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup, p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, p_MJAIPromptRuns_ChildPromptID_Temperature, p_MJAIPromptRuns_ChildPromptID_TopP, p_MJAIPromptRuns_ChildPromptID_TopK, p_MJAIPromptRuns_ChildPromptID_MinP, p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty, p_MJAIPromptRuns_ChildPromptID_PresencePenalty, p_MJAIPromptRuns_ChildPromptID_Seed, p_MJAIPromptRuns_ChildPromptID_StopSequences, p_MJAIPromptRuns_ChildPromptID_ResponseFormat, p_MJAIPromptRuns_ChildPromptID_LogProbs, p_MJAIPromptRuns_ChildPromptID_TopLogProbs, p_MJAIPromptRuns_ChildPromptID_DescendantCost, p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed, p_MJAIPromptRuns_ChildPromptID_ValidationBehavior, p_MJAIPromptRuns_ChildPromptID_RetryStrategy, p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, p_MJAIPromptRuns_ChildPromptID_FinalValidationError, p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount, p_MJAIPromptRuns_ChildPromptID_CommonValidationError, p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt, p_MJAIPromptRuns_ChildPromptID_LastAttemptAt, p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, p_MJAIPromptRuns_ChildPromptID_ValidationAttempts, p_MJAIPromptRuns_ChildPromptID_ValidationSummary, p_MJAIPromptRuns_ChildPromptID_FailoverAttempts, p_MJAIPromptRuns_ChildPromptID_FailoverErrors, p_MJAIPromptRuns_ChildPromptID_FailoverDurations, p_MJAIPromptRuns_ChildPromptID_OriginalModelID, p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, p_MJAIPromptRuns_ChildPromptID_ModelSelection, p_MJAIPromptRuns_ChildPromptID_Status, p_MJAIPromptRuns_ChildPromptID_Cancelled, p_MJAIPromptRuns_ChildPromptID_CancellationReason, p_MJAIPromptRuns_ChildPromptID_ModelPowerRank, p_MJAIPromptRuns_ChildPromptID_SelectionStrategy, p_MJAIPromptRuns_ChildPromptID_CacheHit, p_MJAIPromptRuns_ChildPromptID_CacheKey, p_MJAIPromptRuns_ChildPromptID_JudgeID, p_MJAIPromptRuns_ChildPromptID_JudgeScore, p_MJAIPromptRuns_ChildPromptID_WasSelectedResult, p_MJAIPromptRuns_ChildPromptID_StreamingEnabled, p_MJAIPromptRuns_ChildPromptID_FirstTokenTime, p_MJAIPromptRuns_ChildPromptID_ErrorDetails, p_MJAIPromptRuns_ChildPromptID_ChildPromptID, p_MJAIPromptRuns_ChildPromptID_QueueTime, p_MJAIPromptRuns_ChildPromptID_PromptTime, p_MJAIPromptRuns_ChildPromptID_CompletionTime, p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, p_MJAIPromptRuns_ChildPromptID_EffortLevel, p_MJAIPromptRuns_ChildPromptID_RunName, p_MJAIPromptRuns_ChildPromptID_Comments, p_MJAIPromptRuns_ChildPromptID_TestRunID, p_MJAIPromptRuns_ChildPromptID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt


    FOR _rec IN SELECT "ID", "Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel", "AssistantPrefill", "PrefillFallbackMode", "RequireSpecificModels" FROM __mj."AIPrompt" WHERE "ResultSelectorPromptID" = p_ID
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
        p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels := _rec."RequireSpecificModels";
        -- Set the FK field to NULL
        p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPrompt"(p_MJAIPrompts_ResultSelectorPromptIDID, p_MJAIPrompts_ResultSelectorPromptID_Name, p_MJAIPrompts_ResultSelectorPromptID_Description, p_MJAIPrompts_ResultSelectorPromptID_TemplateID, p_MJAIPrompts_ResultSelectorPromptID_CategoryID, p_MJAIPrompts_ResultSelectorPromptID_TypeID, p_MJAIPrompts_ResultSelectorPromptID_Status, p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat, p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd, p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank, p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, p_MJAIPrompts_ResultSelectorPromptID_PowerPreference, p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, p_MJAIPrompts_ResultSelectorPromptID_ParallelCount, p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, p_MJAIPrompts_ResultSelectorPromptID_OutputType, p_MJAIPrompts_ResultSelectorPromptID_OutputExample, p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, p_MJAIPrompts_ResultSelectorPromptID_MaxRetries, p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy, p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, p_MJAIPrompts_ResultSelectorPromptID_EnableCaching, p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType, p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, p_MJAIPrompts_ResultSelectorPromptID_PromptRole, p_MJAIPrompts_ResultSelectorPromptID_PromptPosition, p_MJAIPrompts_ResultSelectorPromptID_Temperature, p_MJAIPrompts_ResultSelectorPromptID_TopP, p_MJAIPrompts_ResultSelectorPromptID_TopK, p_MJAIPrompts_ResultSelectorPromptID_MinP, p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty, p_MJAIPrompts_ResultSelectorPromptID_Seed, p_MJAIPrompts_ResultSelectorPromptID_StopSequences, p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs, p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, p_MJAIPrompts_ResultSelectorPromptID_EffortLevel, p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels);

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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentClientTool_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentClientTool" ON __mj."AIAgentClientTool";
CREATE TRIGGER "trgUpdateAIAgentClientTool"
    BEFORE UPDATE ON __mj."AIAgentClientTool"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentClientTool_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIClientToolDefinition_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIClientToolDefinition" ON __mj."AIClientToolDefinition";
CREATE TRIGGER "trgUpdateAIClientToolDefinition"
    BEFORE UPDATE ON __mj."AIClientToolDefinition"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIClientToolDefinition_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgent_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgent" ON __mj."AIAgent";
CREATE TRIGGER "trgUpdateAIAgent"
    BEFORE UPDATE ON __mj."AIAgent"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgent_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'ff24ff6c-8047-4fcb-a9e4-a737de7cb66b',
         'MJ: AI Client Tool Definitions',
         'AI Client Tool Definitions',
         NULL,
         NULL,
         'AIClientToolDefinition',
         'vwAIClientToolDefinitions',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: AI Client Tool Definitions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ff24ff6c-8047-4fcb-a9e4-a737de7cb66b', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Client Tool Definitions for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ff24ff6c-8047-4fcb-a9e4-a737de7cb66b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Client Tool Definitions for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ff24ff6c-8047-4fcb-a9e4-a737de7cb66b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Client Tool Definitions for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('ff24ff6c-8047-4fcb-a9e4-a737de7cb66b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL generated to create new entity MJ: AI Agent Client Tools */

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '3838e9b7-875a-4e0d-b861-1c61c6ed5c1d',
         'MJ: AI Agent Client Tools',
         'AI Agent Client Tools',
         NULL,
         NULL,
         'AIAgentClientTool',
         'vwAIAgentClientTools',
         '__mj',
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );
/* SQL generated to add new entity MJ: AI Agent Client Tools to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3838e9b7-875a-4e0d-b861-1c61c6ed5c1d', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Agent Client Tools for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3838e9b7-875a-4e0d-b861-1c61c6ed5c1d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Agent Client Tools for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3838e9b7-875a-4e0d-b861-1c61c6ed5c1d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Agent Client Tools for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('3838e9b7-875a-4e0d-b861-1c61c6ed5c1d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentClientTool" */

UPDATE __mj."AIAgentClientTool" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentClientTool" */

ALTER TABLE __mj."AIAgentClientTool" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentClientTool" */

UPDATE __mj."AIAgentClientTool" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentClientTool" */

ALTER TABLE __mj."AIAgentClientTool" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentClientTool" */

UPDATE __mj."AIClientToolDefinition" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIClientToolDefinition" */

ALTER TABLE __mj."AIClientToolDefinition" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIClientToolDefinition" */

UPDATE __mj."AIClientToolDefinition" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIClientToolDefinition" */

ALTER TABLE __mj."AIClientToolDefinition" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIClientToolDefinition" */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '532e35b2-4eef-4954-8fc8-969205b6387e' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = 'ID')
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
        '532e35b2-4eef-4954-8fc8-969205b6387e',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41f4c49f-915e-4907-8a6b-ddcc89426d22' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = 'AgentID')
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
        '41f4c49f-915e-4907-8a6b-ddcc89426d22',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100002,
        'AgentID',
        'Agent ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0370d385-6f2e-40c6-8b74-58271001373f' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = 'ClientToolDefinitionID')
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
        '0370d385-6f2e-40c6-8b74-58271001373f',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100003,
        'ClientToolDefinitionID',
        'Client Tool Definition ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41acbb0f-b9bb-4a03-af18-34fac78f8c3f' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = 'IsRequired')
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
        '41acbb0f-b9bb-4a03-af18-34fac78f8c3f',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100004,
        'IsRequired',
        'Is Required',
        'When true, the agent expects this tool to always be available on the client. If the client has not registered a handler, agent execution may warn or fail depending on configuration.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '33e2bfe7-6980-41e6-8c05-3083ba3ae5a6' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = 'Priority')
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
        '33e2bfe7-6980-41e6-8c05-3083ba3ae5a6',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100005,
        'Priority',
        'Priority',
        'Sort order for tool listing in prompts. Lower numbers appear first. Tools with the same priority are listed alphabetically.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5acc94ff-4bd3-4605-bdd2-1195eb9b2304' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = '__mj_CreatedAt')
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
        '5acc94ff-4bd3-4605-bdd2-1195eb9b2304',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100006,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8b2dd74-c22c-4d10-a4e1-046bb146485b' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = '__mj_UpdatedAt')
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
        'f8b2dd74-c22c-4d10-a4e1-046bb146485b',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100007,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '98be9ee9-a855-488e-9d97-441aeba2b34d' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'AllowEphemeralClientTools')
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
        '98be9ee9-a855-488e-9d97-441aeba2b34d',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100133,
        'AllowEphemeralClientTools',
        'Allow Ephemeral Client Tools',
        'When true (default), this agent accepts runtime-registered ephemeral client tools that are not defined in metadata. Set to false for agents that require strict tool governance.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2a3365a5-6d03-4da5-a1dc-2e612e6cbb0f' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'ID')
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
        '2a3365a5-6d03-4da5-a1dc-2e612e6cbb0f',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18a5f70a-6a72-4807-9961-a0d12389d9a0' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'Name')
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
        '18a5f70a-6a72-4807-9961-a0d12389d9a0',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100002,
        'Name',
        'Name',
        'Unique identifier for the client tool (e.g., NavigateToApp, NavigateToRecord). Used to match tool invocations from the LLM to registered handlers on the client.',
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        FALSE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad7ced6b-407b-485f-b0b0-5fd75a2222d7' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'Description')
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
        'ad7ced6b-407b-485f-b0b0-5fd75a2222d7',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100003,
        'Description',
        'Description',
        'Human-readable description of what the tool does. This text is injected into the LLM system prompt so it knows when and how to use the tool.',
        'TEXT',
        -1,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a65bd419-fc5c-4dbf-a501-f940957725e4' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'Category')
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
        'a65bd419-fc5c-4dbf-a501-f940957725e4',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100004,
        'Category',
        'Category',
        'Tool category for grouping and filtering (e.g., navigation, form, display, data).',
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c990d33b-c345-46b4-963f-5a576c55062e' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'InputSchemaJSON')
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
        'c990d33b-c345-46b4-963f-5a576c55062e',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100005,
        'InputSchemaJSON',
        'Input Schema JSON',
        'JSON Schema defining the input parameters the tool accepts. Included in the LLM prompt so it generates valid parameter objects.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '77226a92-4bcb-48a8-98aa-769c6299a9b5' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'OutputSchemaJSON')
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
        '77226a92-4bcb-48a8-98aa-769c6299a9b5',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100006,
        'OutputSchemaJSON',
        'Output Schema JSON',
        'JSON Schema describing the return value from the tool. Optional — used for documentation and LLM context.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f73b5f0e-d168-4b38-8154-8f8b22d763d1' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'DefaultTimeoutMs')
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
        'f73b5f0e-d168-4b38-8154-8f8b22d763d1',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100007,
        'DefaultTimeoutMs',
        'Default Timeout Ms',
        'Default timeout in milliseconds for this tool. Can be overridden per-invocation by the LLM or per-run by execution params. Default is 30000ms (30 seconds).',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        '(30000)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4936c17e-03de-44e7-943c-9facf6a79853' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = 'RequiresContextType')
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
        '4936c17e-03de-44e7-943c-9facf6a79853',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100008,
        'RequiresContextType',
        'Requires Context Type',
        'When set, the client only sends this tool to the server when the user is in the specified context (e.g., entity-form, dashboard, search). Null means the tool is always available.',
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b579f76f-0f98-4b0f-9ef2-a51a324dd9c0' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = '__mj_CreatedAt')
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
        'b579f76f-0f98-4b0f-9ef2-a51a324dd9c0',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100009,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5129a182-5463-465c-b775-c9e94c8eed03' OR ("EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B' AND "Name" = '__mj_UpdatedAt')
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
        '5129a182-5463-465c-b775-c9e94c8eed03',
        'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', -- "Entity": "MJ": "AI" "Client" "Tool" "Definitions"
        100010,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '977945f6-8d48-4e17-a444-7776be545979'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('977945f6-8d48-4e17-a444-7776be545979', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', 'AgentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '72726883-b7b9-4c0b-9b0e-95e144dee6a6'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('72726883-b7b9-4c0b-9b0e-95e144dee6a6', 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', 'ClientToolDefinitionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c73142b2-acfa-408b-b130-d4ebdb0f678e' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = 'Agent')
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
        'c73142b2-acfa-408b-b130-d4ebdb0f678e',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100015,
        'Agent',
        'Agent',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '99f91411-463f-4f55-8cc5-b2a828e5df63' OR ("EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D' AND "Name" = 'ClientToolDefinition')
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
        '99f91411-463f-4f55-8cc5-b2a828e5df63',
        '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', -- "Entity": "MJ": "AI" "Agent" "Client" "Tools"
        100016,
        'ClientToolDefinition',
        'Client Tool Definition',
        NULL,
        'TEXT',
        400,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
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
            SET "IsNameField" = TRUE
            WHERE "ID" = '99F91411-463F-4F55-8CC5-B2A828E5DF63'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '41ACBB0F-B9BB-4A03-AF18-34FAC78F8C3F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '33E2BFE7-6980-41E6-8C05-3083BA3AE5A6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C73142B2-ACFA-408B-B130-D4EBDB0F678E'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '99F91411-463F-4F55-8CC5-B2A828E5DF63'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'C73142B2-ACFA-408B-B130-D4EBDB0F678E'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '99F91411-463F-4F55-8CC5-B2A828E5DF63'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A65BD419-FC5C-4DBF-A501-F940957725E4'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F73B5F0E-D168-4B38-8154-8F8B22D763D1'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4936C17E-03DE-44E7-943C-9FACF6A79853'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'A65BD419-FC5C-4DBF-A501-F940957725E4'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '4936C17E-03DE-44E7-943C-9FACF6A79853'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 10 fields */
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2A3365A5-6D03-4DA5-A1DC-2E612E6CBB0F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tool Definition',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tool Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '18A5F70A-6A72-4807-9961-A0D12389D9A0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tool Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD7CED6B-407B-485F-B0B0-5FD75A2222D7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."Category"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tool Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A65BD419-FC5C-4DBF-A501-F940957725E4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."InputSchemaJSON"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Input Schema',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'C990D33B-C345-46B4-963F-5A576C55062E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."OutputSchemaJSON"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Output Schema',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '77226A92-4BCB-48A8-98AA-769C6299A9B5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."DefaultTimeoutMs"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Timeout (ms)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F73B5F0E-D168-4B38-8154-8F8B22D763D1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions."RequiresContextType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Required Context Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4936C17E-03DE-44E7-943C-9FACF6A79853' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B579F76F-0F98-4B0F-9EF2-A51A324DD9C0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Client Tool Definitions.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5129A182-5463-465C-B775-C9E94C8EED03' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-robot */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-robot', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('05c302bf-d4e4-40e2-8018-145e69f4b222', 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', 'FieldCategoryInfo', '{"Tool Definition":{"icon":"fa fa-info-circle","description":"Core identity and descriptive information used by the LLM to understand the tool''s purpose"},"Execution Configuration":{"icon":"fa fa-sliders-h","description":"Technical schemas, timeouts, and environmental constraints for tool execution"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a8a3afb4-0b29-4f5b-83db-9afcf8ba907e', 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B', 'FieldCategoryIcons', '{"Tool Definition":"fa fa-info-circle","Execution Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'FF24FF6C-8047-4FCB-A9E4-A737DE7CB66B';
/* Set categories for 9 fields */
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '532E35B2-4EEF-4954-8FC8-969205B6387E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools."AgentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tool Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '41F4C49F-915E-4907-8A6B-DDCC89426D22' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools."Agent"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tool Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C73142B2-ACFA-408B-B130-D4EBDB0F678E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools."ClientToolDefinitionID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tool Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tool Definition',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0370D385-6F2E-40C6-8B74-58271001373F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools."ClientToolDefinition"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tool Assignment',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tool Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '99F91411-463F-4F55-8CC5-B2A828E5DF63' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools."IsRequired"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '41ACBB0F-B9BB-4A03-AF18-34FAC78F8C3F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '33E2BFE7-6980-41E6-8C05-3083BA3AE5A6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5ACC94FF-4BD3-4605-BDD2-1195EB9B2304' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Client Tools.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F8B2DD74-C22C-4D10-A4E1-046BB146485B' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-toolbox */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-toolbox', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('016abbf3-3725-4d94-b3f1-11fb28b39cb9', '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', 'FieldCategoryInfo', '{"Tool Assignment":{"icon":"fa fa-link","description":"Links and identification fields connecting an AI Agent to its specific client-side tools."},"Execution Settings":{"icon":"fa fa-sliders-h","description":"Configuration parameters that define tool priority and availability requirements during agent execution."},"System Metadata":{"icon":"fa fa-database","description":"System-managed identifiers and audit timestamps for record tracking."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('c07bbbc6-088d-4230-a54c-59ce4483dbdc', '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D', 'FieldCategoryIcons', '{"Tool Assignment":"fa fa-link","Execution Settings":"fa fa-sliders-h","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '3838E9B7-875A-4E0D-B861-1C61C6ED5C1D';
/* Set categories for 71 fields */
-- UPDATE Entity Field Category Info MJ: AI Agents."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."LogoURL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '77845738-5781-458B-AD3C-5DAE745373C2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3177830D-10A0-4003-B95D-8514974BA846' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExposeAsAction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExecutionOrder"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '090830CE-4073-486C-BBF2-E2105BEADD91' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExecutionMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."EnableContextCompression"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionMessageThreshold"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '451D5C8F-6749-4789-A158-658B38A74AE4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionPromptID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Compression Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionMessageRetentionCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73A50D68-976F-49A7-9737-12D1D26C6011' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."TypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '91CA077D-3F59-48E1-A593-AF8686276115' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DriverClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."IconClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ModelSelectionMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadDownstreamPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85B6AA86-796D-4970-9E35-5A483498B517' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadUpstreamPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadSelfReadPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadSelfWritePaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadScope"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E542986-0164-4B9E-8457-06826A4AB892' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidation"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1C7959AE-F48B-4858-8383-28C3F4706314' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidationMaxRetries"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxCostPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '23850C5A-311A-4271-AE53-BD36921C5AA5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxTokensPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxIterationsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxTimePerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MinExecutionsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxExecutionsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."StartingPayloadValidation"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."StartingPayloadValidationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultPromptEffortLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ChatHandlingOption"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultArtifactTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."OwnerUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InvocationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ArtifactCreationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."FunctionalRequirements"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."TechnicalDesign"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InjectNotes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxNotesToInject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."NoteInjectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InjectExamples"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxExamplesToInject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExampleInjectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '291FEE7A-1245-4C82-A470-07EEB8847F1E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."IsRestricted"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E5B17B79-282F-4F19-9656-246DE119D588' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MessageMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '445C1618-EADB-4B34-B318-40C662141FE1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."MaxMessages"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F8924303-D53A-43B0-B70F-5B74FA6248D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentStorageProviderID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentRootPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BA112220-B0D8-4C6F-B63A-027EB706B132' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."InlineStorageThresholdBytes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Inline Storage Threshold Bytes',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AgentTypePromptParams"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ScopeConfig"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."NoteRetentionDays"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Note Retention Days',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ExampleRetentionDays"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Example Retention Days',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A112A808-63DB-4B48-B38F-06554B912DED' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AutoArchiveEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85774265-68C5-4067-9C2B-F70A7F21B94A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."RerankerConfiguration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '269087F5-DEBE-4B14-8FA3-5938ADCF7325' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."CategoryID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AllowEphemeralClientTools"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Runtime Limits & Execution Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '52E74C81-D246-4B52-B7A7-91757C299671' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionPrompt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultArtifactType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."OwnerUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentStorageProvider"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agents."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '644AA4B2-1044-430C-BCBA-245644294E02' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentClientTools" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Client Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Client Tools
-- Item: Permissions for vwAIAgentClientTools
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentClientTools" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Client Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Client Tools
-- Item: spCreateAIAgentClientTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentClientTool
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentClientTool" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Client Tools */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentClientTool" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Client Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Client Tools
-- Item: spUpdateAIAgentClientTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentClientTool
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentClientTool" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentClientTool" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Client Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Client Tools
-- Item: spDeleteAIAgentClientTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentClientTool
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentClientTool" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Client Tools */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentClientTool" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIClientToolDefinition */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Client Tool Definitions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: AI Client Tool Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Client Tool Definitions
-- Item: vwAIClientToolDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Client Tool Definitions
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIClientToolDefinition
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIClientToolDefinitions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Client Tool Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Client Tool Definitions
-- Item: Permissions for vwAIClientToolDefinitions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIClientToolDefinitions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Client Tool Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Client Tool Definitions
-- Item: spCreateAIClientToolDefinition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIClientToolDefinition
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIClientToolDefinition" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Client Tool Definitions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIClientToolDefinition" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Client Tool Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Client Tool Definitions
-- Item: spUpdateAIClientToolDefinition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIClientToolDefinition
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIClientToolDefinition" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIClientToolDefinition" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Client Tool Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Client Tool Definitions
-- Item: spDeleteAIClientToolDefinition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIClientToolDefinition
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIClientToolDefinition" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Client Tool Definitions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIClientToolDefinition" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."AIClientToolDefinition"."Name" IS 'Unique identifier for the client tool (e.g., NavigateToApp, NavigateToRecord). Used to match tool invocations from the LLM to registered handlers on the client.';

COMMENT ON COLUMN __mj."AIClientToolDefinition"."Description" IS 'Human-readable description of what the tool does. This text is injected into the LLM system prompt so it knows when and how to use the tool.';

COMMENT ON COLUMN __mj."AIClientToolDefinition"."Category" IS 'Tool category for grouping and filtering (e.g., navigation, form, display, data).';

COMMENT ON COLUMN __mj."AIClientToolDefinition"."InputSchemaJSON" IS 'JSON Schema defining the input parameters the tool accepts. Included in the LLM prompt so it generates valid parameter objects.';

COMMENT ON COLUMN __mj."AIClientToolDefinition"."OutputSchemaJSON" IS 'JSON Schema describing the return value from the tool. Optional — used for documentation and LLM context.';

COMMENT ON COLUMN __mj."AIClientToolDefinition"."DefaultTimeoutMs" IS 'Default timeout in milliseconds for this tool. Can be overridden per-invocation by the LLM or per-run by execution params. Default is 30000ms (30 seconds).';

COMMENT ON COLUMN __mj."AIClientToolDefinition"."RequiresContextType" IS 'When set, the client only sends this tool to the server when the user is in the specified context (e.g., entity-form, dashboard, search). Null means the tool is always available.';

COMMENT ON COLUMN __mj."AIAgentClientTool"."IsRequired" IS 'When true, the agent expects this tool to always be available on the client. If the client has not registered a handler, agent execution may warn or fail depending on configuration.';

COMMENT ON COLUMN __mj."AIAgentClientTool"."Priority" IS 'Sort order for tool listing in prompts. Lower numbers appear first. Tools with the same priority are listed alphabetically.';

COMMENT ON COLUMN __mj."AIAgent"."AllowEphemeralClientTools" IS 'When true (default), this agent accepts runtime-registered ephemeral client tools that are not defined in metadata. Set to false for agents that require strict tool governance.';


-- ===================== Other =====================

-- Migration: Add Client Tool Definitions and AI Agent Client Tools tables
-- Also adds AllowEphemeralClientTools column to AI Agents
--
-- Client Tool Definitions: Catalog of reusable, admin-manageable tool definitions
-- that agents can use to invoke browser-side actions (navigation, forms, display).
--
-- AI Agent Client Tools: Junction table linking agents to their authorized client tools.
-- Replaces the JSON blob approach in AgentTypePromptParams.clientTools.

-- =============================================================================
-- 1. Create MJ: AI Client Tool Definitions table
-- =============================================================================

/* spUpdate Permissions for MJ: AI Agent Client Tools */

/* spUpdate Permissions for MJ: AI Client Tool Definitions */

/* spUpdate Permissions for MJ: AI Agents */
