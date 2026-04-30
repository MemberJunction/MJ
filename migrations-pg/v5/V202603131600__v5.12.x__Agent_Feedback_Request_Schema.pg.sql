
-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."AIAgentRequestType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(100) NOT NULL,
 "Description" TEXT NULL,
 "Icon" VARCHAR(100) NULL,
 CONSTRAINT PK_AIAgentRequestType PRIMARY KEY ("ID"),
 CONSTRAINT UQ_AIAgentRequestType_Name UNIQUE ("Name")
);

------------------------------------------------------------------------
-- 2. Extend AIAgentRequest — all new columns in two ALTER statements
-- (Split because SQL Server doesn't allow multiple inline FK
-- constraints referencing different tables in a single ADD.)
------------------------------------------------------------------------

-- 2a. Non-FK columns + the RequestTypeID FK (single table ref);

ALTER TABLE __mj."AIAgentRequest"
 ADD COLUMN "RequestTypeID" UUID NULL
        CONSTRAINT FK_AIAgentRequest_RequestType
            REFERENCES __mj."AIAgentRequestType"("ID"),
 ADD COLUMN "ResponseSchema" TEXT NULL,
 ADD COLUMN "ResponseData" TEXT NULL,
 ADD COLUMN "Priority" INTEGER NOT NULL
        CONSTRAINT DF_AIAgentRequest_Priority DEFAULT 50
        CONSTRAINT CK_AIAgentRequest_Priority CHECK ("Priority" >= 1 AND "Priority" <= 100),
 ADD COLUMN "ExpiresAt" TIMESTAMPTZ NULL;

-- 2b. Run/step linking FKs (reference AIAgentRun and AIAgentRunStep);

ALTER TABLE __mj."AIAgentRequest"
 ADD COLUMN "OriginatingAgentRunID" UUID NULL
        CONSTRAINT FK_AIAgentRequest_OriginatingRun
            REFERENCES __mj."AIAgentRun"("ID"),
 ADD COLUMN "OriginatingAgentRunStepID" UUID NULL
        CONSTRAINT FK_AIAgentRequest_OriginatingStep
            REFERENCES __mj."AIAgentRunStep"("ID"),
 ADD COLUMN "ResumingAgentRunID" UUID NULL
        CONSTRAINT FK_AIAgentRequest_ResumingRun
            REFERENCES __mj."AIAgentRun"("ID");

------------------------------------------------------------------------
-- 3. Expand AIAgentRequest."Status" to include Responded and Expired
--    Dynamic lookup avoids hardcoding auto-generated constraint names.
------------------------------------------------------------------------;

ALTER TABLE __mj."AIAgentRequestType"
 ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentRequestType" */

ALTER TABLE __mj."AIAgentRequestType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentRequestType" */

ALTER TABLE __mj."AIAgentRequestType"
 ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentRequestType" */

ALTER TABLE __mj."AIAgentRequestType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();
/* SQL text to insert new entity field */

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRequest_AgentID" ON __mj."AIAgentRequest" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestForUserID" ON __mj."AIAgentRequest" ("RequestForUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRequest_ResponseByUserID" ON __mj."AIAgentRequest" ("ResponseByUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestTypeID" ON __mj."AIAgentRequest" ("RequestTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRequest_OriginatingAgentRunID" ON __mj."AIAgentRequest" ("OriginatingAgentRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRequest_OriginatingAgentRunStepID" ON __mj."AIAgentRequest" ("OriginatingAgentRunStepID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRequest_ResumingAgentRunID" ON __mj."AIAgentRequest" ("ResumingAgentRunID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAIAgentRequestTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRequestTypes"
AS SELECT
    a.*
FROM
    __mj."AIAgentRequestType" AS a$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgentRequests';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRequests"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJUser_RequestForUserID"."Name" AS "RequestForUser",
    "MJUser_ResponseByUserID"."Name" AS "ResponseByUser",
    "MJAIAgentRequestType_RequestTypeID"."Name" AS "RequestType",
    "MJAIAgentRun_OriginatingAgentRunID"."RunName" AS "OriginatingAgentRun",
    "MJAIAgentRunStep_OriginatingAgentRunStepID"."StepName" AS "OriginatingAgentRunStep",
    "MJAIAgentRun_ResumingAgentRunID"."RunName" AS "ResumingAgentRun"
FROM
    __mj."AIAgentRequest" AS a
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_RequestForUserID"
  ON
    a."RequestForUserID" = "MJUser_RequestForUserID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_ResponseByUserID"
  ON
    a."ResponseByUserID" = "MJUser_ResponseByUserID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRequestType" AS "MJAIAgentRequestType_RequestTypeID"
  ON
    a."RequestTypeID" = "MJAIAgentRequestType_RequestTypeID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_OriginatingAgentRunID"
  ON
    a."OriginatingAgentRunID" = "MJAIAgentRun_OriginatingAgentRunID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRunStep" AS "MJAIAgentRunStep_OriginatingAgentRunStepID"
  ON
    a."OriginatingAgentRunStepID" = "MJAIAgentRunStep_OriginatingAgentRunStepID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_ResumingAgentRunID"
  ON
    a."ResumingAgentRunID" = "MJAIAgentRun_ResumingAgentRunID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRequestType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Icon VARCHAR(100) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRequestTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentRequestType"
            (
                "ID",
                "Name",
                "Description",
                "Icon"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_Icon
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentRequestType"
            (
                "Name",
                "Description",
                "Icon"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_Icon
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRequestTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRequestType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100),
    IN p_Description TEXT,
    IN p_Icon VARCHAR(100)
)
RETURNS SETOF __mj."vwAIAgentRequestTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRequestType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Icon" = p_Icon
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRequestTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRequestTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRequestType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentRequestType"
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRequest"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_RequestedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RequestForUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Request TEXT DEFAULT NULL,
    IN p_Response TEXT DEFAULT NULL,
    IN p_ResponseByUserID UUID DEFAULT NULL,
    IN p_RespondedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_RequestTypeID UUID DEFAULT NULL,
    IN p_ResponseSchema TEXT DEFAULT NULL,
    IN p_ResponseData TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_OriginatingAgentRunID UUID DEFAULT NULL,
    IN p_OriginatingAgentRunStepID UUID DEFAULT NULL,
    IN p_ResumingAgentRunID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRequests" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentRequest"
            (
                "ID",
                "AgentID",
                "RequestedAt",
                "RequestForUserID",
                "Status",
                "Request",
                "Response",
                "ResponseByUserID",
                "RespondedAt",
                "Comments",
                "RequestTypeID",
                "ResponseSchema",
                "ResponseData",
                "Priority",
                "ExpiresAt",
                "OriginatingAgentRunID",
                "OriginatingAgentRunStepID",
                "ResumingAgentRunID"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                p_RequestedAt,
                p_RequestForUserID,
                p_Status,
                p_Request,
                p_Response,
                p_ResponseByUserID,
                p_RespondedAt,
                p_Comments,
                p_RequestTypeID,
                p_ResponseSchema,
                p_ResponseData,
                COALESCE(p_Priority, 50),
                p_ExpiresAt,
                p_OriginatingAgentRunID,
                p_OriginatingAgentRunStepID,
                p_ResumingAgentRunID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentRequest"
            (
                "AgentID",
                "RequestedAt",
                "RequestForUserID",
                "Status",
                "Request",
                "Response",
                "ResponseByUserID",
                "RespondedAt",
                "Comments",
                "RequestTypeID",
                "ResponseSchema",
                "ResponseData",
                "Priority",
                "ExpiresAt",
                "OriginatingAgentRunID",
                "OriginatingAgentRunStepID",
                "ResumingAgentRunID"
            )
        VALUES
            (
                p_AgentID,
                p_RequestedAt,
                p_RequestForUserID,
                p_Status,
                p_Request,
                p_Response,
                p_ResponseByUserID,
                p_RespondedAt,
                p_Comments,
                p_RequestTypeID,
                p_ResponseSchema,
                p_ResponseData,
                COALESCE(p_Priority, 50),
                p_ExpiresAt,
                p_OriginatingAgentRunID,
                p_OriginatingAgentRunStepID,
                p_ResumingAgentRunID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRequest"(
    IN p_ID UUID,
    IN p_AgentID UUID,
    IN p_RequestedAt TIMESTAMPTZ,
    IN p_RequestForUserID UUID,
    IN p_Status VARCHAR(20),
    IN p_Request TEXT,
    IN p_Response TEXT,
    IN p_ResponseByUserID UUID,
    IN p_RespondedAt TIMESTAMPTZ,
    IN p_Comments TEXT,
    IN p_RequestTypeID UUID,
    IN p_ResponseSchema TEXT,
    IN p_ResponseData TEXT,
    IN p_Priority INTEGER,
    IN p_ExpiresAt TIMESTAMPTZ,
    IN p_OriginatingAgentRunID UUID,
    IN p_OriginatingAgentRunStepID UUID,
    IN p_ResumingAgentRunID UUID
)
RETURNS SETOF __mj."vwAIAgentRequests" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRequest"
    SET
        "AgentID" = p_AgentID,
        "RequestedAt" = p_RequestedAt,
        "RequestForUserID" = p_RequestForUserID,
        "Status" = p_Status,
        "Request" = p_Request,
        "Response" = p_Response,
        "ResponseByUserID" = p_ResponseByUserID,
        "RespondedAt" = p_RespondedAt,
        "Comments" = p_Comments,
        "RequestTypeID" = p_RequestTypeID,
        "ResponseSchema" = p_ResponseSchema,
        "ResponseData" = p_ResponseData,
        "Priority" = p_Priority,
        "ExpiresAt" = p_ExpiresAt,
        "OriginatingAgentRunID" = p_OriginatingAgentRunID,
        "OriginatingAgentRunStepID" = p_OriginatingAgentRunStepID,
        "ResumingAgentRunID" = p_ResumingAgentRunID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRequest"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentRequest"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunStep"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentRequests_OriginatingAgentRunStepIDID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_AgentID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Status VARCHAR(20);
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Request TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Response TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Comments TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Priority INTEGER;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_0a03b4 UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246 UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAge_3f1d42 UUID;
    p_MJAIAgentRunSteps_ParentIDID UUID;
    p_MJAIAgentRunSteps_ParentID_AgentRunID UUID;
    p_MJAIAgentRunSteps_ParentID_StepNumber INTEGER;
    p_MJAIAgentRunSteps_ParentID_StepType VARCHAR(50);
    p_MJAIAgentRunSteps_ParentID_StepName VARCHAR(255);
    p_MJAIAgentRunSteps_ParentID_TargetID UUID;
    p_MJAIAgentRunSteps_ParentID_Status VARCHAR(50);
    p_MJAIAgentRunSteps_ParentID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRunSteps_ParentID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRunSteps_ParentID_Success BOOLEAN;
    p_MJAIAgentRunSteps_ParentID_ErrorMessage TEXT;
    p_MJAIAgentRunSteps_ParentID_InputData TEXT;
    p_MJAIAgentRunSteps_ParentID_OutputData TEXT;
    p_MJAIAgentRunSteps_ParentID_TargetLogID UUID;
    p_MJAIAgentRunSteps_ParentID_PayloadAtStart TEXT;
    p_MJAIAgentRunSteps_ParentID_PayloadAtEnd TEXT;
    p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult VARCHAR(25);
    p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages TEXT;
    p_MJAIAgentRunSteps_ParentID_ParentID UUID;
    p_MJAIAgentRunSteps_ParentID_Comments TEXT;
BEGIN
-- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID" FROM __mj."AIAgentRequest" WHERE "OriginatingAgentRunStepID" = p_ID
    LOOP
        p_MJAIAgentRequests_OriginatingAgentRunStepIDID := _rec."ID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_AgentID := _rec."AgentID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt := _rec."RequestedAt";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID := _rec."RequestForUserID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Status := _rec."Status";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Request := _rec."Request";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Response := _rec."Response";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID := _rec."ResponseByUserID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt := _rec."RespondedAt";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Comments := _rec."Comments";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID := _rec."RequestTypeID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema := _rec."ResponseSchema";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData := _rec."ResponseData";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Priority := _rec."Priority";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_0a03b4 := _rec."OriginatingAgentRunID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246 := _rec."OriginatingAgentRunStepID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAge_3f1d42 := _rec."ResumingAgentRunID";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_MJAIAgentRequests_OriginatingAgentRunStepIDID, p_MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, p_MJAIAgentRequests_OriginatingAgentRunStepID_Status, p_MJAIAgentRequests_OriginatingAgentRunStepID_Request, p_MJAIAgentRequests_OriginatingAgentRunStepID_Response, p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, p_MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, p_MJAIAgentRequests_OriginatingAgentRunStepID_Comments, p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, p_MJAIAgentRequests_OriginatingAgentRunStepID_Priority, p_MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_0a03b4, p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246, p_MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAge_3f1d42);

    END LOOP;

    
    -- Cascade update on AIAgentRunStep using cursor to call spUpdateAIAgentRunStep


    FOR _rec IN SELECT "ID", "AgentRunID", "StepNumber", "StepType", "StepName", "TargetID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "InputData", "OutputData", "TargetLogID", "PayloadAtStart", "PayloadAtEnd", "FinalPayloadValidationResult", "FinalPayloadValidationMessages", "ParentID", "Comments" FROM __mj."AIAgentRunStep" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIAgentRunSteps_ParentIDID := _rec."ID";
        p_MJAIAgentRunSteps_ParentID_AgentRunID := _rec."AgentRunID";
        p_MJAIAgentRunSteps_ParentID_StepNumber := _rec."StepNumber";
        p_MJAIAgentRunSteps_ParentID_StepType := _rec."StepType";
        p_MJAIAgentRunSteps_ParentID_StepName := _rec."StepName";
        p_MJAIAgentRunSteps_ParentID_TargetID := _rec."TargetID";
        p_MJAIAgentRunSteps_ParentID_Status := _rec."Status";
        p_MJAIAgentRunSteps_ParentID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRunSteps_ParentID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRunSteps_ParentID_Success := _rec."Success";
        p_MJAIAgentRunSteps_ParentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRunSteps_ParentID_InputData := _rec."InputData";
        p_MJAIAgentRunSteps_ParentID_OutputData := _rec."OutputData";
        p_MJAIAgentRunSteps_ParentID_TargetLogID := _rec."TargetLogID";
        p_MJAIAgentRunSteps_ParentID_PayloadAtStart := _rec."PayloadAtStart";
        p_MJAIAgentRunSteps_ParentID_PayloadAtEnd := _rec."PayloadAtEnd";
        p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult := _rec."FinalPayloadValidationResult";
        p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages := _rec."FinalPayloadValidationMessages";
        p_MJAIAgentRunSteps_ParentID_ParentID := _rec."ParentID";
        p_MJAIAgentRunSteps_ParentID_Comments := _rec."Comments";
        -- Set the FK field to NULL
        p_MJAIAgentRunSteps_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRunStep"(p_MJAIAgentRunSteps_ParentIDID, p_MJAIAgentRunSteps_ParentID_AgentRunID, p_MJAIAgentRunSteps_ParentID_StepNumber, p_MJAIAgentRunSteps_ParentID_StepType, p_MJAIAgentRunSteps_ParentID_StepName, p_MJAIAgentRunSteps_ParentID_TargetID, p_MJAIAgentRunSteps_ParentID_Status, p_MJAIAgentRunSteps_ParentID_StartedAt, p_MJAIAgentRunSteps_ParentID_CompletedAt, p_MJAIAgentRunSteps_ParentID_Success, p_MJAIAgentRunSteps_ParentID_ErrorMessage, p_MJAIAgentRunSteps_ParentID_InputData, p_MJAIAgentRunSteps_ParentID_OutputData, p_MJAIAgentRunSteps_ParentID_TargetLogID, p_MJAIAgentRunSteps_ParentID_PayloadAtStart, p_MJAIAgentRunSteps_ParentID_PayloadAtEnd, p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, p_MJAIAgentRunSteps_ParentID_ParentID, p_MJAIAgentRunSteps_ParentID_Comments);

    END LOOP;

    

    DELETE FROM
        __mj."AIAgentRunStep"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentExamples_SourceAIAgentRunIDID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_AgentID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_UserID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_CompanyID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_Type VARCHAR(20);
    p_MJAIAgentExamples_SourceAIAgentRunID_ExampleInput TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversation_a05cb8 UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_SuccessScore NUMERIC(5,2);
    p_MJAIAgentExamples_SourceAIAgentRunID_Comments TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_Status VARCHAR(20);
    p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentExamples_SourceAIAgentRunID_AccessCount INTEGER;
    p_MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceAIAgentRunIDID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_AgentID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_Note TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_UserID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_Type VARCHAR(20);
    p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_SourceAIAgentRunID_Comments TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_Status VARCHAR(20);
    p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount INTEGER;
    p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunIDID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_AgentID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_RequestedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_Status VARCHAR(20);
    p_MJAIAgentRequests_OriginatingAgentRunID_Request TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_Response TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_RespondedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunID_Comments TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseData TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_Priority INTEGER;
    p_MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgen_2294cf UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID UUID;
    p_MJAIAgentRequests_ResumingAgentRunIDID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_AgentID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_RequestedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_ResumingAgentRunID_RequestForUserID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_Status VARCHAR(20);
    p_MJAIAgentRequests_ResumingAgentRunID_Request TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_Response TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_RespondedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_ResumingAgentRunID_Comments TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_RequestTypeID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseSchema TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseData TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_Priority INTEGER;
    p_MJAIAgentRequests_ResumingAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRu_4faa57 UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID UUID;
    p_MJAIAgentRunMedias_AgentRunIDID UUID;
    p_MJAIAgentRunSteps_AgentRunIDID UUID;
    p_MJAIAgentRuns_ParentRunIDID UUID;
    p_MJAIAgentRuns_ParentRunID_AgentID UUID;
    p_MJAIAgentRuns_ParentRunID_ParentRunID UUID;
    p_MJAIAgentRuns_ParentRunID_Status VARCHAR(50);
    p_MJAIAgentRuns_ParentRunID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ParentRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ParentRunID_Success BOOLEAN;
    p_MJAIAgentRuns_ParentRunID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ParentRunID_ConversationID UUID;
    p_MJAIAgentRuns_ParentRunID_UserID UUID;
    p_MJAIAgentRuns_ParentRunID_Result TEXT;
    p_MJAIAgentRuns_ParentRunID_AgentState TEXT;
    p_MJAIAgentRuns_ParentRunID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ParentRunID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ParentRunID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ParentRunID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ParentRunID_FinalPayload TEXT;
    p_MJAIAgentRuns_ParentRunID_Message TEXT;
    p_MJAIAgentRuns_ParentRunID_LastRunID UUID;
    p_MJAIAgentRuns_ParentRunID_StartingPayload TEXT;
    p_MJAIAgentRuns_ParentRunID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ParentRunID_ConfigurationID UUID;
    p_MJAIAgentRuns_ParentRunID_OverrideModelID UUID;
    p_MJAIAgentRuns_ParentRunID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ParentRunID_Data TEXT;
    p_MJAIAgentRuns_ParentRunID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ParentRunID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ParentRunID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ParentRunID_Comments TEXT;
    p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ParentRunID_TestRunID UUID;
    p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ParentRunID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ParentRunID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_LastRunIDID UUID;
    p_MJAIAgentRuns_LastRunID_AgentID UUID;
    p_MJAIAgentRuns_LastRunID_ParentRunID UUID;
    p_MJAIAgentRuns_LastRunID_Status VARCHAR(50);
    p_MJAIAgentRuns_LastRunID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_LastRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_LastRunID_Success BOOLEAN;
    p_MJAIAgentRuns_LastRunID_ErrorMessage TEXT;
    p_MJAIAgentRuns_LastRunID_ConversationID UUID;
    p_MJAIAgentRuns_LastRunID_UserID UUID;
    p_MJAIAgentRuns_LastRunID_Result TEXT;
    p_MJAIAgentRuns_LastRunID_AgentState TEXT;
    p_MJAIAgentRuns_LastRunID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_LastRunID_ConversationDetailID UUID;
    p_MJAIAgentRuns_LastRunID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_LastRunID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_LastRunID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_LastRunID_FinalPayload TEXT;
    p_MJAIAgentRuns_LastRunID_Message TEXT;
    p_MJAIAgentRuns_LastRunID_LastRunID UUID;
    p_MJAIAgentRuns_LastRunID_StartingPayload TEXT;
    p_MJAIAgentRuns_LastRunID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_LastRunID_ConfigurationID UUID;
    p_MJAIAgentRuns_LastRunID_OverrideModelID UUID;
    p_MJAIAgentRuns_LastRunID_OverrideVendorID UUID;
    p_MJAIAgentRuns_LastRunID_Data TEXT;
    p_MJAIAgentRuns_LastRunID_Verbose BOOLEAN;
    p_MJAIAgentRuns_LastRunID_EffortLevel INTEGER;
    p_MJAIAgentRuns_LastRunID_RunName VARCHAR(255);
    p_MJAIAgentRuns_LastRunID_Comments TEXT;
    p_MJAIAgentRuns_LastRunID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_LastRunID_TestRunID UUID;
    p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_LastRunID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_LastRunID_ExternalReferenceID VARCHAR(200);
    p_MJAIPromptRuns_AgentRunIDID UUID;
    p_MJAIPromptRuns_AgentRunID_PromptID UUID;
    p_MJAIPromptRuns_AgentRunID_ModelID UUID;
    p_MJAIPromptRuns_AgentRunID_VendorID UUID;
    p_MJAIPromptRuns_AgentRunID_AgentID UUID;
    p_MJAIPromptRuns_AgentRunID_ConfigurationID UUID;
    p_MJAIPromptRuns_AgentRunID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_AgentRunID_Messages TEXT;
    p_MJAIPromptRuns_AgentRunID_Result TEXT;
    p_MJAIPromptRuns_AgentRunID_TokensUsed INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_AgentRunID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentRunID_Success BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_ErrorMessage TEXT;
    p_MJAIPromptRuns_AgentRunID_ParentID UUID;
    p_MJAIPromptRuns_AgentRunID_RunType VARCHAR(20);
    p_MJAIPromptRuns_AgentRunID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_AgentRunID_AgentRunID UUID;
    p_MJAIPromptRuns_AgentRunID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_AgentRunID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_AgentRunID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_AgentRunID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_TopK INTEGER;
    p_MJAIPromptRuns_AgentRunID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_Seed INTEGER;
    p_MJAIPromptRuns_AgentRunID_StopSequences TEXT;
    p_MJAIPromptRuns_AgentRunID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_AgentRunID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_AgentRunID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_AgentRunID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_AgentRunID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_AgentRunID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_AgentRunID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_AgentRunID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_AgentRunID_ValidationSummary TEXT;
    p_MJAIPromptRuns_AgentRunID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_AgentRunID_FailoverErrors TEXT;
    p_MJAIPromptRuns_AgentRunID_FailoverDurations TEXT;
    p_MJAIPromptRuns_AgentRunID_OriginalModelID UUID;
    p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_AgentRunID_ModelSelection TEXT;
    p_MJAIPromptRuns_AgentRunID_Status VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_CancellationReason TEXT;
    p_MJAIPromptRuns_AgentRunID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_AgentRunID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_AgentRunID_JudgeID UUID;
    p_MJAIPromptRuns_AgentRunID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_AgentRunID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_ErrorDetails TEXT;
    p_MJAIPromptRuns_AgentRunID_ChildPromptID UUID;
    p_MJAIPromptRuns_AgentRunID_QueueTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_PromptTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_CompletionTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_AgentRunID_EffortLevel INTEGER;
    p_MJAIPromptRuns_AgentRunID_RunName VARCHAR(255);
    p_MJAIPromptRuns_AgentRunID_Comments TEXT;
    p_MJAIPromptRuns_AgentRunID_TestRunID UUID;
BEGIN
-- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentExample" WHERE "SourceAIAgentRunID" = p_ID
    LOOP
        p_MJAIAgentExamples_SourceAIAgentRunIDID := _rec."ID";
        p_MJAIAgentExamples_SourceAIAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentExamples_SourceAIAgentRunID_UserID := _rec."UserID";
        p_MJAIAgentExamples_SourceAIAgentRunID_CompanyID := _rec."CompanyID";
        p_MJAIAgentExamples_SourceAIAgentRunID_Type := _rec."Type";
        p_MJAIAgentExamples_SourceAIAgentRunID_ExampleInput := _rec."ExampleInput";
        p_MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput := _rec."ExampleOutput";
        p_MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversation_a05cb8 := _rec."SourceConversationDetailID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SuccessScore := _rec."SuccessScore";
        p_MJAIAgentExamples_SourceAIAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentExamples_SourceAIAgentRunID_Status := _rec."Status";
        p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentExamples_SourceAIAgentRunID_AccessCount := _rec."AccessCount";
        p_MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentExample"(p_MJAIAgentExamples_SourceAIAgentRunIDID, p_MJAIAgentExamples_SourceAIAgentRunID_AgentID, p_MJAIAgentExamples_SourceAIAgentRunID_UserID, p_MJAIAgentExamples_SourceAIAgentRunID_CompanyID, p_MJAIAgentExamples_SourceAIAgentRunID_Type, p_MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, p_MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, p_MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversation_a05cb8, p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, p_MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, p_MJAIAgentExamples_SourceAIAgentRunID_Comments, p_MJAIAgentExamples_SourceAIAgentRunID_Status, p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, p_MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, p_MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, p_MJAIAgentExamples_SourceAIAgentRunID_AccessCount, p_MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentNote" WHERE "SourceAIAgentRunID" = p_ID
    LOOP
        p_MJAIAgentNotes_SourceAIAgentRunIDID := _rec."ID";
        p_MJAIAgentNotes_SourceAIAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_SourceAIAgentRunID_Note := _rec."Note";
        p_MJAIAgentNotes_SourceAIAgentRunID_UserID := _rec."UserID";
        p_MJAIAgentNotes_SourceAIAgentRunID_Type := _rec."Type";
        p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_SourceAIAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentNotes_SourceAIAgentRunID_Status := _rec."Status";
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_MJAIAgentNotes_SourceAIAgentRunIDID, p_MJAIAgentNotes_SourceAIAgentRunID_AgentID, p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, p_MJAIAgentNotes_SourceAIAgentRunID_Note, p_MJAIAgentNotes_SourceAIAgentRunID_UserID, p_MJAIAgentNotes_SourceAIAgentRunID_Type, p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, p_MJAIAgentNotes_SourceAIAgentRunID_Comments, p_MJAIAgentNotes_SourceAIAgentRunID_Status, p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID, p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount, p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID" FROM __mj."AIAgentRequest" WHERE "OriginatingAgentRunID" = p_ID
    LOOP
        p_MJAIAgentRequests_OriginatingAgentRunIDID := _rec."ID";
        p_MJAIAgentRequests_OriginatingAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRequests_OriginatingAgentRunID_RequestedAt := _rec."RequestedAt";
        p_MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID := _rec."RequestForUserID";
        p_MJAIAgentRequests_OriginatingAgentRunID_Status := _rec."Status";
        p_MJAIAgentRequests_OriginatingAgentRunID_Request := _rec."Request";
        p_MJAIAgentRequests_OriginatingAgentRunID_Response := _rec."Response";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID := _rec."ResponseByUserID";
        p_MJAIAgentRequests_OriginatingAgentRunID_RespondedAt := _rec."RespondedAt";
        p_MJAIAgentRequests_OriginatingAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID := _rec."RequestTypeID";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema := _rec."ResponseSchema";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseData := _rec."ResponseData";
        p_MJAIAgentRequests_OriginatingAgentRunID_Priority := _rec."Priority";
        p_MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID := _rec."OriginatingAgentRunID";
        p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgen_2294cf := _rec."OriginatingAgentRunStepID";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID := _rec."ResumingAgentRunID";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_MJAIAgentRequests_OriginatingAgentRunIDID, p_MJAIAgentRequests_OriginatingAgentRunID_AgentID, p_MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, p_MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, p_MJAIAgentRequests_OriginatingAgentRunID_Status, p_MJAIAgentRequests_OriginatingAgentRunID_Request, p_MJAIAgentRequests_OriginatingAgentRunID_Response, p_MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, p_MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, p_MJAIAgentRequests_OriginatingAgentRunID_Comments, p_MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, p_MJAIAgentRequests_OriginatingAgentRunID_ResponseData, p_MJAIAgentRequests_OriginatingAgentRunID_Priority, p_MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgen_2294cf, p_MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID);

    END LOOP;

    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID" FROM __mj."AIAgentRequest" WHERE "ResumingAgentRunID" = p_ID
    LOOP
        p_MJAIAgentRequests_ResumingAgentRunIDID := _rec."ID";
        p_MJAIAgentRequests_ResumingAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRequests_ResumingAgentRunID_RequestedAt := _rec."RequestedAt";
        p_MJAIAgentRequests_ResumingAgentRunID_RequestForUserID := _rec."RequestForUserID";
        p_MJAIAgentRequests_ResumingAgentRunID_Status := _rec."Status";
        p_MJAIAgentRequests_ResumingAgentRunID_Request := _rec."Request";
        p_MJAIAgentRequests_ResumingAgentRunID_Response := _rec."Response";
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID := _rec."ResponseByUserID";
        p_MJAIAgentRequests_ResumingAgentRunID_RespondedAt := _rec."RespondedAt";
        p_MJAIAgentRequests_ResumingAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentRequests_ResumingAgentRunID_RequestTypeID := _rec."RequestTypeID";
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseSchema := _rec."ResponseSchema";
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseData := _rec."ResponseData";
        p_MJAIAgentRequests_ResumingAgentRunID_Priority := _rec."Priority";
        p_MJAIAgentRequests_ResumingAgentRunID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID := _rec."OriginatingAgentRunID";
        p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRu_4faa57 := _rec."OriginatingAgentRunStepID";
        p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID := _rec."ResumingAgentRunID";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_MJAIAgentRequests_ResumingAgentRunIDID, p_MJAIAgentRequests_ResumingAgentRunID_AgentID, p_MJAIAgentRequests_ResumingAgentRunID_RequestedAt, p_MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, p_MJAIAgentRequests_ResumingAgentRunID_Status, p_MJAIAgentRequests_ResumingAgentRunID_Request, p_MJAIAgentRequests_ResumingAgentRunID_Response, p_MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, p_MJAIAgentRequests_ResumingAgentRunID_RespondedAt, p_MJAIAgentRequests_ResumingAgentRunID_Comments, p_MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, p_MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, p_MJAIAgentRequests_ResumingAgentRunID_ResponseData, p_MJAIAgentRequests_ResumingAgentRunID_Priority, p_MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRu_4faa57, p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID);

    END LOOP;

    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRunMedia" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIAgentRunMedias_AgentRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRunMedia"(p_MJAIAgentRunMedias_AgentRunIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRunStep" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIAgentRunSteps_AgentRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRunStep"(p_MJAIAgentRunSteps_AgentRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID" FROM __mj."AIAgentRun" WHERE "ParentRunID" = p_ID
    LOOP
        p_MJAIAgentRuns_ParentRunIDID := _rec."ID";
        p_MJAIAgentRuns_ParentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ParentRunID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ParentRunID_Status := _rec."Status";
        p_MJAIAgentRuns_ParentRunID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ParentRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ParentRunID_Success := _rec."Success";
        p_MJAIAgentRuns_ParentRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ParentRunID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ParentRunID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ParentRunID_Result := _rec."Result";
        p_MJAIAgentRuns_ParentRunID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ParentRunID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ParentRunID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ParentRunID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ParentRunID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ParentRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ParentRunID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ParentRunID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ParentRunID_Message := _rec."Message";
        p_MJAIAgentRuns_ParentRunID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ParentRunID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ParentRunID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ParentRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ParentRunID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ParentRunID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ParentRunID_Data := _rec."Data";
        p_MJAIAgentRuns_ParentRunID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ParentRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ParentRunID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ParentRunID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ParentRunID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ParentRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ParentRunID_ExternalReferenceID := _rec."ExternalReferenceID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ParentRunID_ParentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_MJAIAgentRuns_ParentRunIDID, p_MJAIAgentRuns_ParentRunID_AgentID, p_MJAIAgentRuns_ParentRunID_ParentRunID, p_MJAIAgentRuns_ParentRunID_Status, p_MJAIAgentRuns_ParentRunID_StartedAt, p_MJAIAgentRuns_ParentRunID_CompletedAt, p_MJAIAgentRuns_ParentRunID_Success, p_MJAIAgentRuns_ParentRunID_ErrorMessage, p_MJAIAgentRuns_ParentRunID_ConversationID, p_MJAIAgentRuns_ParentRunID_UserID, p_MJAIAgentRuns_ParentRunID_Result, p_MJAIAgentRuns_ParentRunID_AgentState, p_MJAIAgentRuns_ParentRunID_TotalTokensUsed, p_MJAIAgentRuns_ParentRunID_TotalCost, p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, p_MJAIAgentRuns_ParentRunID_TotalCostRollup, p_MJAIAgentRuns_ParentRunID_ConversationDetailID, p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence, p_MJAIAgentRuns_ParentRunID_CancellationReason, p_MJAIAgentRuns_ParentRunID_FinalStep, p_MJAIAgentRuns_ParentRunID_FinalPayload, p_MJAIAgentRuns_ParentRunID_Message, p_MJAIAgentRuns_ParentRunID_LastRunID, p_MJAIAgentRuns_ParentRunID_StartingPayload, p_MJAIAgentRuns_ParentRunID_TotalPromptIterations, p_MJAIAgentRuns_ParentRunID_ConfigurationID, p_MJAIAgentRuns_ParentRunID_OverrideModelID, p_MJAIAgentRuns_ParentRunID_OverrideVendorID, p_MJAIAgentRuns_ParentRunID_Data, p_MJAIAgentRuns_ParentRunID_Verbose, p_MJAIAgentRuns_ParentRunID_EffortLevel, p_MJAIAgentRuns_ParentRunID_RunName, p_MJAIAgentRuns_ParentRunID_Comments, p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID, p_MJAIAgentRuns_ParentRunID_TestRunID, p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, p_MJAIAgentRuns_ParentRunID_SecondaryScopes, p_MJAIAgentRuns_ParentRunID_ExternalReferenceID);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID" FROM __mj."AIAgentRun" WHERE "LastRunID" = p_ID
    LOOP
        p_MJAIAgentRuns_LastRunIDID := _rec."ID";
        p_MJAIAgentRuns_LastRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_LastRunID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_LastRunID_Status := _rec."Status";
        p_MJAIAgentRuns_LastRunID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_LastRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_LastRunID_Success := _rec."Success";
        p_MJAIAgentRuns_LastRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_LastRunID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_LastRunID_UserID := _rec."UserID";
        p_MJAIAgentRuns_LastRunID_Result := _rec."Result";
        p_MJAIAgentRuns_LastRunID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_LastRunID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_LastRunID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_LastRunID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_LastRunID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_LastRunID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_LastRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_LastRunID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_LastRunID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_LastRunID_Message := _rec."Message";
        p_MJAIAgentRuns_LastRunID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_LastRunID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_LastRunID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_LastRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_LastRunID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_LastRunID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_LastRunID_Data := _rec."Data";
        p_MJAIAgentRuns_LastRunID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_LastRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_LastRunID_RunName := _rec."RunName";
        p_MJAIAgentRuns_LastRunID_Comments := _rec."Comments";
        p_MJAIAgentRuns_LastRunID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_LastRunID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_LastRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_LastRunID_ExternalReferenceID := _rec."ExternalReferenceID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_LastRunID_LastRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_MJAIAgentRuns_LastRunIDID, p_MJAIAgentRuns_LastRunID_AgentID, p_MJAIAgentRuns_LastRunID_ParentRunID, p_MJAIAgentRuns_LastRunID_Status, p_MJAIAgentRuns_LastRunID_StartedAt, p_MJAIAgentRuns_LastRunID_CompletedAt, p_MJAIAgentRuns_LastRunID_Success, p_MJAIAgentRuns_LastRunID_ErrorMessage, p_MJAIAgentRuns_LastRunID_ConversationID, p_MJAIAgentRuns_LastRunID_UserID, p_MJAIAgentRuns_LastRunID_Result, p_MJAIAgentRuns_LastRunID_AgentState, p_MJAIAgentRuns_LastRunID_TotalTokensUsed, p_MJAIAgentRuns_LastRunID_TotalCost, p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, p_MJAIAgentRuns_LastRunID_TotalCostRollup, p_MJAIAgentRuns_LastRunID_ConversationDetailID, p_MJAIAgentRuns_LastRunID_ConversationDetailSequence, p_MJAIAgentRuns_LastRunID_CancellationReason, p_MJAIAgentRuns_LastRunID_FinalStep, p_MJAIAgentRuns_LastRunID_FinalPayload, p_MJAIAgentRuns_LastRunID_Message, p_MJAIAgentRuns_LastRunID_LastRunID, p_MJAIAgentRuns_LastRunID_StartingPayload, p_MJAIAgentRuns_LastRunID_TotalPromptIterations, p_MJAIAgentRuns_LastRunID_ConfigurationID, p_MJAIAgentRuns_LastRunID_OverrideModelID, p_MJAIAgentRuns_LastRunID_OverrideVendorID, p_MJAIAgentRuns_LastRunID_Data, p_MJAIAgentRuns_LastRunID_Verbose, p_MJAIAgentRuns_LastRunID_EffortLevel, p_MJAIAgentRuns_LastRunID_RunName, p_MJAIAgentRuns_LastRunID_Comments, p_MJAIAgentRuns_LastRunID_ScheduledJobRunID, p_MJAIAgentRuns_LastRunID_TestRunID, p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, p_MJAIAgentRuns_LastRunID_SecondaryScopes, p_MJAIAgentRuns_LastRunID_ExternalReferenceID);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID" FROM __mj."AIPromptRun" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIPromptRuns_AgentRunIDID := _rec."ID";
        p_MJAIPromptRuns_AgentRunID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_AgentRunID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_AgentRunID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_AgentRunID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_AgentRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_AgentRunID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_AgentRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_AgentRunID_Messages := _rec."Messages";
        p_MJAIPromptRuns_AgentRunID_Result := _rec."Result";
        p_MJAIPromptRuns_AgentRunID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_AgentRunID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_AgentRunID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_AgentRunID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_AgentRunID_Success := _rec."Success";
        p_MJAIPromptRuns_AgentRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_AgentRunID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_AgentRunID_RunType := _rec."RunType";
        p_MJAIPromptRuns_AgentRunID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_AgentRunID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_AgentRunID_Cost := _rec."Cost";
        p_MJAIPromptRuns_AgentRunID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_AgentRunID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_AgentRunID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_AgentRunID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_AgentRunID_TopP := _rec."TopP";
        p_MJAIPromptRuns_AgentRunID_TopK := _rec."TopK";
        p_MJAIPromptRuns_AgentRunID_MinP := _rec."MinP";
        p_MJAIPromptRuns_AgentRunID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_AgentRunID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_AgentRunID_Seed := _rec."Seed";
        p_MJAIPromptRuns_AgentRunID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_AgentRunID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_AgentRunID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_AgentRunID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_AgentRunID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_AgentRunID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_AgentRunID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_AgentRunID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_AgentRunID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_AgentRunID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_AgentRunID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_AgentRunID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_AgentRunID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_AgentRunID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_AgentRunID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_AgentRunID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_AgentRunID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_AgentRunID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_AgentRunID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_AgentRunID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_AgentRunID_Status := _rec."Status";
        p_MJAIPromptRuns_AgentRunID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_AgentRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_AgentRunID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_AgentRunID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_AgentRunID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_AgentRunID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_AgentRunID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_AgentRunID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_AgentRunID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_AgentRunID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_AgentRunID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_AgentRunID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_AgentRunID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_AgentRunID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_AgentRunID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_AgentRunID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_AgentRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_AgentRunID_RunName := _rec."RunName";
        p_MJAIPromptRuns_AgentRunID_Comments := _rec."Comments";
        p_MJAIPromptRuns_AgentRunID_TestRunID := _rec."TestRunID";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_AgentRunIDID, p_MJAIPromptRuns_AgentRunID_PromptID, p_MJAIPromptRuns_AgentRunID_ModelID, p_MJAIPromptRuns_AgentRunID_VendorID, p_MJAIPromptRuns_AgentRunID_AgentID, p_MJAIPromptRuns_AgentRunID_ConfigurationID, p_MJAIPromptRuns_AgentRunID_RunAt, p_MJAIPromptRuns_AgentRunID_CompletedAt, p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS, p_MJAIPromptRuns_AgentRunID_Messages, p_MJAIPromptRuns_AgentRunID_Result, p_MJAIPromptRuns_AgentRunID_TokensUsed, p_MJAIPromptRuns_AgentRunID_TokensPrompt, p_MJAIPromptRuns_AgentRunID_TokensCompletion, p_MJAIPromptRuns_AgentRunID_TotalCost, p_MJAIPromptRuns_AgentRunID_Success, p_MJAIPromptRuns_AgentRunID_ErrorMessage, p_MJAIPromptRuns_AgentRunID_ParentID, p_MJAIPromptRuns_AgentRunID_RunType, p_MJAIPromptRuns_AgentRunID_ExecutionOrder, p_MJAIPromptRuns_AgentRunID_AgentRunID, p_MJAIPromptRuns_AgentRunID_Cost, p_MJAIPromptRuns_AgentRunID_CostCurrency, p_MJAIPromptRuns_AgentRunID_TokensUsedRollup, p_MJAIPromptRuns_AgentRunID_TokensPromptRollup, p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup, p_MJAIPromptRuns_AgentRunID_Temperature, p_MJAIPromptRuns_AgentRunID_TopP, p_MJAIPromptRuns_AgentRunID_TopK, p_MJAIPromptRuns_AgentRunID_MinP, p_MJAIPromptRuns_AgentRunID_FrequencyPenalty, p_MJAIPromptRuns_AgentRunID_PresencePenalty, p_MJAIPromptRuns_AgentRunID_Seed, p_MJAIPromptRuns_AgentRunID_StopSequences, p_MJAIPromptRuns_AgentRunID_ResponseFormat, p_MJAIPromptRuns_AgentRunID_LogProbs, p_MJAIPromptRuns_AgentRunID_TopLogProbs, p_MJAIPromptRuns_AgentRunID_DescendantCost, p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount, p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, p_MJAIPromptRuns_AgentRunID_FinalValidationPassed, p_MJAIPromptRuns_AgentRunID_ValidationBehavior, p_MJAIPromptRuns_AgentRunID_RetryStrategy, p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, p_MJAIPromptRuns_AgentRunID_FinalValidationError, p_MJAIPromptRuns_AgentRunID_ValidationErrorCount, p_MJAIPromptRuns_AgentRunID_CommonValidationError, p_MJAIPromptRuns_AgentRunID_FirstAttemptAt, p_MJAIPromptRuns_AgentRunID_LastAttemptAt, p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, p_MJAIPromptRuns_AgentRunID_ValidationAttempts, p_MJAIPromptRuns_AgentRunID_ValidationSummary, p_MJAIPromptRuns_AgentRunID_FailoverAttempts, p_MJAIPromptRuns_AgentRunID_FailoverErrors, p_MJAIPromptRuns_AgentRunID_FailoverDurations, p_MJAIPromptRuns_AgentRunID_OriginalModelID, p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration, p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, p_MJAIPromptRuns_AgentRunID_ModelSelection, p_MJAIPromptRuns_AgentRunID_Status, p_MJAIPromptRuns_AgentRunID_Cancelled, p_MJAIPromptRuns_AgentRunID_CancellationReason, p_MJAIPromptRuns_AgentRunID_ModelPowerRank, p_MJAIPromptRuns_AgentRunID_SelectionStrategy, p_MJAIPromptRuns_AgentRunID_CacheHit, p_MJAIPromptRuns_AgentRunID_CacheKey, p_MJAIPromptRuns_AgentRunID_JudgeID, p_MJAIPromptRuns_AgentRunID_JudgeScore, p_MJAIPromptRuns_AgentRunID_WasSelectedResult, p_MJAIPromptRuns_AgentRunID_StreamingEnabled, p_MJAIPromptRuns_AgentRunID_FirstTokenTime, p_MJAIPromptRuns_AgentRunID_ErrorDetails, p_MJAIPromptRuns_AgentRunID_ChildPromptID, p_MJAIPromptRuns_AgentRunID_QueueTime, p_MJAIPromptRuns_AgentRunID_PromptTime, p_MJAIPromptRuns_AgentRunID_CompletionTime, p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, p_MJAIPromptRuns_AgentRunID_EffortLevel, p_MJAIPromptRuns_AgentRunID_RunName, p_MJAIPromptRuns_AgentRunID_Comments, p_MJAIPromptRuns_AgentRunID_TestRunID);

    END LOOP;

    

    DELETE FROM
        __mj."AIAgentRun"
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


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_MJAIAgents_ParentIDID, p_MJAIAgents_ParentID_Name, p_MJAIAgents_ParentID_Description, p_MJAIAgents_ParentID_LogoURL, p_MJAIAgents_ParentID_ParentID, p_MJAIAgents_ParentID_ExposeAsAction, p_MJAIAgents_ParentID_ExecutionOrder, p_MJAIAgents_ParentID_ExecutionMode, p_MJAIAgents_ParentID_EnableContextCompression, p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_MJAIAgents_ParentID_ContextCompressionPromptID, p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_MJAIAgents_ParentID_TypeID, p_MJAIAgents_ParentID_Status, p_MJAIAgents_ParentID_DriverClass, p_MJAIAgents_ParentID_IconClass, p_MJAIAgents_ParentID_ModelSelectionMode, p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_MJAIAgents_ParentID_PayloadScope, p_MJAIAgents_ParentID_FinalPayloadValidation, p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MJAIAgents_ParentID_MaxCostPerRun, p_MJAIAgents_ParentID_MaxTokensPerRun, p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MJAIAgents_ParentID_MaxTimePerRun, p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_MJAIAgents_ParentID_StartingPayloadValidation, p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_MJAIAgents_ParentID_ChatHandlingOption, p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_MJAIAgents_ParentID_OwnerUserID, p_MJAIAgents_ParentID_InvocationMode, p_MJAIAgents_ParentID_ArtifactCreationMode, p_MJAIAgents_ParentID_FunctionalRequirements, p_MJAIAgents_ParentID_TechnicalDesign, p_MJAIAgents_ParentID_InjectNotes, p_MJAIAgents_ParentID_MaxNotesToInject, p_MJAIAgents_ParentID_NoteInjectionStrategy, p_MJAIAgents_ParentID_InjectExamples, p_MJAIAgents_ParentID_MaxExamplesToInject, p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_MJAIAgents_ParentID_IsRestricted, p_MJAIAgents_ParentID_MessageMode, p_MJAIAgents_ParentID_MaxMessages, p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_MJAIAgents_ParentID_AttachmentRootPath, p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_MJAIAgents_ParentID_AgentTypePromptParams, p_MJAIAgents_ParentID_ScopeConfig, p_MJAIAgents_ParentID_NoteRetentionDays, p_MJAIAgents_ParentID_ExampleRetentionDays, p_MJAIAgents_ParentID_AutoArchiveEnabled, p_MJAIAgents_ParentID_RerankerConfiguration);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID" FROM __mj."AIPromptRun" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_AgentIDID, p_MJAIPromptRuns_AgentID_PromptID, p_MJAIPromptRuns_AgentID_ModelID, p_MJAIPromptRuns_AgentID_VendorID, p_MJAIPromptRuns_AgentID_AgentID, p_MJAIPromptRuns_AgentID_ConfigurationID, p_MJAIPromptRuns_AgentID_RunAt, p_MJAIPromptRuns_AgentID_CompletedAt, p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_MJAIPromptRuns_AgentID_Messages, p_MJAIPromptRuns_AgentID_Result, p_MJAIPromptRuns_AgentID_TokensUsed, p_MJAIPromptRuns_AgentID_TokensPrompt, p_MJAIPromptRuns_AgentID_TokensCompletion, p_MJAIPromptRuns_AgentID_TotalCost, p_MJAIPromptRuns_AgentID_Success, p_MJAIPromptRuns_AgentID_ErrorMessage, p_MJAIPromptRuns_AgentID_ParentID, p_MJAIPromptRuns_AgentID_RunType, p_MJAIPromptRuns_AgentID_ExecutionOrder, p_MJAIPromptRuns_AgentID_AgentRunID, p_MJAIPromptRuns_AgentID_Cost, p_MJAIPromptRuns_AgentID_CostCurrency, p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_MJAIPromptRuns_AgentID_Temperature, p_MJAIPromptRuns_AgentID_TopP, p_MJAIPromptRuns_AgentID_TopK, p_MJAIPromptRuns_AgentID_MinP, p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_MJAIPromptRuns_AgentID_PresencePenalty, p_MJAIPromptRuns_AgentID_Seed, p_MJAIPromptRuns_AgentID_StopSequences, p_MJAIPromptRuns_AgentID_ResponseFormat, p_MJAIPromptRuns_AgentID_LogProbs, p_MJAIPromptRuns_AgentID_TopLogProbs, p_MJAIPromptRuns_AgentID_DescendantCost, p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_MJAIPromptRuns_AgentID_ValidationBehavior, p_MJAIPromptRuns_AgentID_RetryStrategy, p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_MJAIPromptRuns_AgentID_FinalValidationError, p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_MJAIPromptRuns_AgentID_CommonValidationError, p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_MJAIPromptRuns_AgentID_LastAttemptAt, p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_MJAIPromptRuns_AgentID_ValidationAttempts, p_MJAIPromptRuns_AgentID_ValidationSummary, p_MJAIPromptRuns_AgentID_FailoverAttempts, p_MJAIPromptRuns_AgentID_FailoverErrors, p_MJAIPromptRuns_AgentID_FailoverDurations, p_MJAIPromptRuns_AgentID_OriginalModelID, p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_MJAIPromptRuns_AgentID_ModelSelection, p_MJAIPromptRuns_AgentID_Status, p_MJAIPromptRuns_AgentID_Cancelled, p_MJAIPromptRuns_AgentID_CancellationReason, p_MJAIPromptRuns_AgentID_ModelPowerRank, p_MJAIPromptRuns_AgentID_SelectionStrategy, p_MJAIPromptRuns_AgentID_CacheHit, p_MJAIPromptRuns_AgentID_CacheKey, p_MJAIPromptRuns_AgentID_JudgeID, p_MJAIPromptRuns_AgentID_JudgeScore, p_MJAIPromptRuns_AgentID_WasSelectedResult, p_MJAIPromptRuns_AgentID_StreamingEnabled, p_MJAIPromptRuns_AgentID_FirstTokenTime, p_MJAIPromptRuns_AgentID_ErrorDetails, p_MJAIPromptRuns_AgentID_ChildPromptID, p_MJAIPromptRuns_AgentID_QueueTime, p_MJAIPromptRuns_AgentID_PromptTime, p_MJAIPromptRuns_AgentID_CompletionTime, p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_MJAIPromptRuns_AgentID_EffortLevel, p_MJAIPromptRuns_AgentID_RunName, p_MJAIPromptRuns_AgentID_Comments, p_MJAIPromptRuns_AgentID_TestRunID);

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


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentRequestType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentRequestType" ON __mj."AIAgentRequestType";
CREATE TRIGGER "trgUpdateAIAgentRequestType"
    BEFORE UPDATE ON __mj."AIAgentRequestType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentRequestType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentRequest_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentRequest" ON __mj."AIAgentRequest";
CREATE TRIGGER "trgUpdateAIAgentRequest"
    BEFORE UPDATE ON __mj."AIAgentRequest"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentRequest_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
DECLARE
  v_ConstraintName VARCHAR(200);
BEGIN
  SELECT cc.constraint_name INTO v_ConstraintName FROM information_schema.check_constraints cc
  JOIN information_schema.constraint_column_usage ccu
  ON cc.constraint_name = ccu.constraint_name
  AND cc.constraint_schema = ccu.constraint_schema
  WHERE ccu.table_name = 'AIAgentRequest'
  AND ccu.column_name = 'Status'
  AND ccu.table_schema = '__mj';
  IF v_ConstraintName IS NOT NULL THEN
  EXECUTE format('ALTER TABLE "__mj"."AIAgentRequest" DROP CONSTRAINT %I', v_ConstraintName);
  END IF;
END $$;

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
         '359389b4-54d1-46b2-ad9a-5b84750bab0b',
         'MJ: AI Agent Request Types',
         'AI Agent Request Types',
         'Lookup table categorizing the types of requests an agent can make to a human (e.g., Approval, Information, Choice, Review, Custom).',
         NULL,
         'AIAgentRequestType',
         'vwAIAgentRequestTypes',
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
/* SQL generated to add new entity MJ: AI Agent Request Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '359389b4-54d1-46b2-ad9a-5b84750bab0b', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Agent Request Types for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('359389b4-54d1-46b2-ad9a-5b84750bab0b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Agent Request Types for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('359389b4-54d1-46b2-ad9a-5b84750bab0b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, FALSE, NOW(), NOW());
/* SQL generated to add new permission for entity MJ: AI Agent Request Types for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('359389b4-54d1-46b2-ad9a-5b84750bab0b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());
/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentRequestType" */

UPDATE __mj."AIAgentRequestType" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;
/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentRequestType" */

ALTER TABLE __mj."AIAgentRequestType" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."AIAgentRequestType" */

UPDATE __mj."AIAgentRequestType" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;
/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentRequestType" */

ALTER TABLE __mj."AIAgentRequestType" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."AIAgentRequestType" */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e5a2a82-c652-4a76-83b5-5fa95dce7bea' OR ("EntityID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B' AND "Name" = 'ID')
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
        '0e5a2a82-c652-4a76-83b5-5fa95dce7bea',
        '359389B4-54D1-46B2-AD9A-5B84750BAB0B', -- "Entity": "MJ": "AI" "Agent" "Request" "Types"
        100001,
        'ID',
        'ID',
        'Primary key for the AIAgentRequestType record.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6058f94-a6ca-45f2-8887-a8657aa0d03d' OR ("EntityID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B' AND "Name" = 'Name')
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
        'd6058f94-a6ca-45f2-8887-a8657aa0d03d',
        '359389B4-54D1-46B2-AD9A-5B84750BAB0B', -- "Entity": "MJ": "AI" "Agent" "Request" "Types"
        100002,
        'Name',
        'Name',
        'Unique display name for the request type (e.g., Approval, Information, Choice).',
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5441ec95-10ae-4c2a-bd85-a4f66012c565' OR ("EntityID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B' AND "Name" = 'Description')
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
        '5441ec95-10ae-4c2a-bd85-a4f66012c565',
        '359389B4-54D1-46B2-AD9A-5B84750BAB0B', -- "Entity": "MJ": "AI" "Agent" "Request" "Types"
        100003,
        'Description',
        'Description',
        'Explains when and how this request type should be used by agents.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '447bcc32-2000-4d69-97f8-3479ed7a2f4c' OR ("EntityID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B' AND "Name" = 'Icon')
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
        '447bcc32-2000-4d69-97f8-3479ed7a2f4c',
        '359389B4-54D1-46B2-AD9A-5B84750BAB0B', -- "Entity": "MJ": "AI" "Agent" "Request" "Types"
        100004,
        'Icon',
        'Icon',
        'Font Awesome icon class for UI rendering of this request type.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffebd1a8-7a54-4412-a949-0a517a9d8830' OR ("EntityID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B' AND "Name" = '__mj_CreatedAt')
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
        'ffebd1a8-7a54-4412-a949-0a517a9d8830',
        '359389B4-54D1-46B2-AD9A-5B84750BAB0B', -- "Entity": "MJ": "AI" "Agent" "Request" "Types"
        100005,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3898514f-6afe-4a20-93a2-101b3ee8fa9f' OR ("EntityID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B' AND "Name" = '__mj_UpdatedAt')
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
        '3898514f-6afe-4a20-93a2-101b3ee8fa9f',
        '359389B4-54D1-46B2-AD9A-5B84750BAB0B', -- "Entity": "MJ": "AI" "Agent" "Request" "Types"
        100006,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a3e5ad0c-1968-467e-96ff-41d2b0d9358b' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'RequestTypeID')
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
        'a3e5ad0c-1968-467e-96ff-41d2b0d9358b',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100036,
        'RequestTypeID',
        'Request Type ID',
        'Foreign key to AIAgentRequestType. Categorizes the purpose of this request (Approval, Information, Choice, Review, Custom).',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '359389B4-54D1-46B2-AD9A-5B84750BAB0B',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5810273c-6dcb-4772-b0cd-7b989b387103' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'ResponseSchema')
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
        '5810273c-6dcb-4772-b0cd-7b989b387103',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100037,
        'ResponseSchema',
        'Response Schema',
        'JSON-serialized AgentResponseForm defining the structured input form the agent presents to the human. Uses the same form types as ConversationDetail."ResponseForm".',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f756ffd-34b0-462d-97d3-d4237fda6c73' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'ResponseData')
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
        '5f756ffd-34b0-462d-97d3-d4237fda6c73',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100038,
        'ResponseData',
        'Response Data',
        'JSON structured response data provided by the human, conforming to the ResponseSchema definition.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4fea225c-8d62-4c2b-b8e6-db2869a59bdc' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'Priority')
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
        '4fea225c-8d62-4c2b-b8e6-db2869a59bdc',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100039,
        'Priority',
        'Priority',
        'Urgency level of the request as an integer from 1 (lowest) to 100 (highest). Default is 50. Suggested ranges: 1-25 Low, 26-50 Normal, 51-75 High, 76-100 Critical. Used for notification routing and dashboard sorting.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(50)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0567323b-a358-4dd9-b3f3-81c0a94c4bc6' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'ExpiresAt')
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
        '0567323b-a358-4dd9-b3f3-81c0a94c4bc6',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100040,
        'ExpiresAt',
        'Expires At',
        'Optional deadline for the human to respond. After this time the request may be marked Expired by a background process.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7c9db7fc-90b2-4ecf-b82a-70a97ae1f796' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'OriginatingAgentRunID')
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
        '7c9db7fc-90b2-4ecf-b82a-70a97ae1f796',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100041,
        'OriginatingAgentRunID',
        'Originating Agent Run ID',
        'Foreign key to AIAgentRun. The agent run that created this request. Used to trace request origin in run chains.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '5190AF93-4C39-4429-BDAA-0AEB492A0256',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1529bd25-4ad9-4888-8687-a926959493d9' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'OriginatingAgentRunStepID')
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
        '1529bd25-4ad9-4888-8687-a926959493d9',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100042,
        'OriginatingAgentRunStepID',
        'Originating Agent Run Step ID',
        'Foreign key to AIAgentRunStep. The specific execution step that triggered this request.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '99273DAD-560E-4ABC-8332-C97AB58B7463',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b78b06d4-671a-4ce5-a9b9-cabd224b2a08' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'ResumingAgentRunID')
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
        'b78b06d4-671a-4ce5-a9b9-cabd224b2a08',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100043,
        'ResumingAgentRunID',
        'Resuming Agent Run ID',
        'Foreign key to AIAgentRun. The new agent run spawned after the human responds. NULL until a response triggers a resuming run.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '5190AF93-4C39-4429-BDAA-0AEB492A0256',
        'ID',
        FALSE,
        FALSE,
        TRUE,
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
                                       ('a55208ff-c607-4949-a95a-eb3aa4fd71f2', '49218650-7B04-4C4C-B109-A255D6627EAB', 3, 'Expired', 'Expired', NOW(), NOW());
/* SQL text to insert entity field value with ID b6b2cdc5-6e5e-4205-b063-d2e68fd66b33 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('b6b2cdc5-6e5e-4205-b063-d2e68fd66b33', '49218650-7B04-4C4C-B109-A255D6627EAB', 6, 'Responded', 'Responded', NOW(), NOW());
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='9513B49C-D722-4E28-85BF-9E05A1990F85';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='4207D942-832E-441D-8EEE-8EFA40BFF275';
/* SQL text to insert entity field value with ID 97ce7555-796b-4601-ae92-d86fc2e102e0 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('97ce7555-796b-4601-ae92-d86fc2e102e0', 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5', 1, 'AwaitingFeedback', 'AwaitingFeedback', NOW(), NOW());
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=2 WHERE "ID"='87BAE441-C0F4-4246-A1BE-CAAE5E4C79D8';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=3 WHERE "ID"='E8B058D3-2148-42CE-9350-F7FB13E99EF5';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='75970520-CE25-46CC-BF7E-4BAE6E379CD5';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='C393F41A-7889-479E-BAAD-E3556141E909';
/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=6 WHERE "ID"='8CC6137B-B688-49F1-BE9E-C31B5D8B8FFA';
/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: AI Agent Requests (One To Many via OriginatingAgentRunID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '79240ba0-0b84-453a-819b-7af6637358ed'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('79240ba0-0b84-453a-819b-7af6637358ed', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'OriginatingAgentRunID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6300b4dd-47ae-4837-bf8e-f4e75d39ceb0'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('6300b4dd-47ae-4837-bf8e-f4e75d39ceb0', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'ResumingAgentRunID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '988e370f-6ee2-4240-9fce-2ccd40082df1'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('988e370f-6ee2-4240-9fce-2ccd40082df1', '359389B4-54D1-46B2-AD9A-5B84750BAB0B', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'RequestTypeID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c290b895-aca8-4403-96f8-86a47836be53'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('c290b895-aca8-4403-96f8-86a47836be53', '99273DAD-560E-4ABC-8332-C97AB58B7463', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'OriginatingAgentRunStepID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8a7ba61-a0de-461b-af00-a83d51b7bfa3' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'RequestType')
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
        'b8a7ba61-a0de-461b-af00-a83d51b7bfa3',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100047,
        'RequestType',
        'Request Type',
        NULL,
        'TEXT',
        200,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '91461548-61c8-4d64-8e95-cf809a82e9e1' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'OriginatingAgentRun')
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
        '91461548-61c8-4d64-8e95-cf809a82e9e1',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100048,
        'OriginatingAgentRun',
        'Originating Agent Run',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5038de6b-9e95-46fd-9784-9d95066d3135' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'OriginatingAgentRunStep')
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
        '5038de6b-9e95-46fd-9784-9d95066d3135',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100049,
        'OriginatingAgentRunStep',
        'Originating Agent Run Step',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fed675fa-60fe-47ed-ac35-221cb7797ca4' OR ("EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'ResumingAgentRun')
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
        'fed675fa-60fe-47ed-ac35-221cb7797ca4',
        'F3C49FE2-B5D9-40D4-8562-6596261772A0', -- "Entity": "MJ": "AI" "Agent" "Requests"
        100050,
        'ResumingAgentRun',
        'Resuming Agent Run',
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

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5441EC95-10AE-4C2A-BD85-A4F66012C565'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '447BCC32-2000-4D69-97F8-3479ED7A2F4C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '5441EC95-10AE-4C2A-BD85-A4F66012C565'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 6 fields */
-- UPDATE Entity Field Category Info MJ: AI Agent Request Types."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0E5A2A82-C652-4A76-83B5-5FA95DCE7BEA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Request Types."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Type Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D6058F94-A6CA-45F2-8887-A8657AA0D03D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Request Types."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Type Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5441EC95-10AE-4C2A-BD85-A4F66012C565' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Request Types."Icon"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Type Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '447BCC32-2000-4D69-97F8-3479ED7A2F4C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Request Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFEBD1A8-7A54-4412-A949-0A517A9D8830' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Request Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3898514F-6AFE-4A20-93A2-101B3EE8FA9F' AND "AutoUpdateCategory" = TRUE;
/* Set entity icon to fa fa-robot */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-robot', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('4d5a9c81-ddc8-4bfb-8926-7c1198e23d4f', '359389B4-54D1-46B2-AD9A-5B84750BAB0B', 'FieldCategoryInfo', '{"Request Type Configuration":{"icon":"fa fa-tasks","description":"Core settings defining how the AI agent request type appears and functions"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and technical identifiers"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('4f603fbc-51be-49cb-9740-e2caf08818e2', '359389B4-54D1-46B2-AD9A-5B84750BAB0B', 'FieldCategoryIcons', '{"Request Type Configuration":"fa fa-tasks","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '359389B4-54D1-46B2-AD9A-5B84750BAB0B';
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4FEA225C-8D62-4C2B-B8E6-DB2869A59BDC'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'B8A7BA61-A0DE-461B-AF00-A83D51B7BFA3'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'FA548A7C-380A-41D7-8E62-1A43376F34F8'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'B8A7BA61-A0DE-461B-AF00-A83D51B7BFA3'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 27 fields */
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2AEC7EF2-934A-4296-BF14-F98C9F9B5357' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."AgentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7825BE5D-B314-4D44-9145-E8641009AA85' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."Agent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A41E6BF9-7CC3-4B3A-AA78-A2C82DE6EE75' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."RequestTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Summary',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Request Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A3E5AD0C-1968-467E-96FF-41D2B0D9358B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."RequestType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Summary',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Request Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B8A7BA61-A0DE-461B-AF00-A83D51B7BFA3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."RequestedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '949E0012-3ECD-4DBF-B66F-8A560DA01DA3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."RequestForUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4DACDDC8-2461-4995-A2CA-469250521F44' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."RequestForUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Request For User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '99AD5962-A952-4D4A-9B43-10AAAE11A448' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '49218650-7B04-4C4C-B109-A255D6627EAB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Summary',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4FEA225C-8D62-4C2B-B8E6-DB2869A59BDC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ExpiresAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Request Summary',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0567323B-A358-4DD9-B3F3-81C0A94C4BC6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."Request"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Request Details',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '50DA67D1-BF71-4E90-9F16-74D359285CE5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."Comments"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Internal Comments',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9087F477-068B-4F38-9EE4-2C0B7BC65A90' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."Response"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Response Text',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FA548A7C-380A-41D7-8E62-1A43376F34F8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ResponseByUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Responded By',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3D9F4176-C838-47F2-8E96-E3D45B588FE6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ResponseByUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Responded By Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '206573B2-F307-4269-A4E9-196753CA82C0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."RespondedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8AE9367C-44FF-4D15-84F9-8742882C3706' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ResponseSchema"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Response Summary',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Response Form Schema',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '5810273C-6DCB-4772-B0CD-7B989B387103' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ResponseData"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Response Summary',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '5F756FFD-34B0-462D-97D3-D4237FDA6C73' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."OriginatingAgentRunID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Originating Agent Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7C9DB7FC-90B2-4ECF-B82A-70A97AE1F796' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."OriginatingAgentRun"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Originating Run Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '91461548-61C8-4D64-8E95-CF809A82E9E1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."OriginatingAgentRunStepID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Originating Run Step',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1529BD25-4AD9-4888-8687-A926959493D9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."OriginatingAgentRunStep"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Originating Step Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5038DE6B-9E95-46FD-9784-9D95066D3135' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ResumingAgentRunID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Resuming Agent Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B78B06D4-671A-4CE5-A9B9-CABD224B2A08' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests."ResumingAgentRun"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Resuming Run Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FED675FA-60FE-47ED-AC35-221CB7797CA4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '75A2E62E-3914-48B6-9A31-E7728A1B92B0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Agent Requests.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2BC4635D-0F49-43B5-8E7C-FB57C0D4F6B8' AND "AutoUpdateCategory" = TRUE;
/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Execution Context":{"icon":"fa fa-project-diagram","description":"Traceability details linking this request to the specific AI agent runs and execution steps that generated or resumed from it."}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'FieldCategoryInfo';
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Execution Context":"fa fa-project-diagram"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'F3C49FE2-B5D9-40D4-8562-6596261772A0' AND "Name" = 'FieldCategoryIcons';
/* Generated Validation Functions for MJ: AI Agent Requests */
-- CHECK constraint for MJ: AI Agent Requests: Field: Priority was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript','Approved', '("Priority">=TRUE AND "Priority"<=(100))', 'public ValidatePriorityRange(result: ValidationResult) {
	// Check if Priority is within the allowed range of 1 to 100
	if (this."Priority" != null && (this."Priority" < 1 || this."Priority" > 100)) {
		result."Errors".push(new ValidationErrorInfo(
			"Priority",
			"Priority must be between 1 and 100.",
			this."Priority",
			ValidationErrorType."Failure"
		));
	}
}', 'Priority must be between 1 and 100 to ensure requests are correctly ranked and processed within the allowed range.', 'ValidatePriorityRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '4FEA225C-8D62-4C2B-B8E6-DB2869A59BDC');


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."AIAgentRequest"
 ADD CONSTRAINT "CK_AIAgentRequest_Status"
    CHECK ("Status" IN ('Requested', 'Approved', 'Rejected', 'Canceled', 'Responded', 'Expired')) NOT VALID;

------------------------------------------------------------------------
-- 4. Expand AIAgentRun."Status" to include AwaitingFeedback
------------------------------------------------------------------------
DO $$ DECLARE v_ConstraintName TEXT;
BEGIN
  SELECT cc.constraint_name INTO v_ConstraintName FROM information_schema.check_constraints cc
JOIN information_schema.constraint_column_usage ccu
    ON cc.constraint_name = ccu.constraint_name
    AND cc.constraint_schema = ccu.constraint_schema
WHERE ccu.table_name = 'AIAgentRun'
    AND ccu.column_name = 'Status'
    AND ccu.table_schema = '__mj';
  IF v_ConstraintName IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "__mj"."AIAgentRun" DROP CONSTRAINT %I', v_ConstraintName);
  END IF;
END $$;

ALTER TABLE __mj."AIAgentRun"
 ADD CONSTRAINT "CK_AIAgentRun_Status"
    CHECK ("Status" IN ('Running', 'Completed', 'Failed', 'Paused', 'Cancelled', 'AwaitingFeedback')) NOT VALID;

------------------------------------------------------------------------
-- 5. Extended properties — table and column documentation
------------------------------------------------------------------------

-- AIAgentRequestType table;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRequestTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Request Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Request Types
-- Item: Permissions for vwAIAgentRequestTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRequestTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Request Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Request Types
-- Item: spCreateAIAgentRequestType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRequestType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequestType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Request Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequestType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Request Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Request Types
-- Item: spUpdateAIAgentRequestType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRequestType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequestType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequestType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Request Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Request Types
-- Item: spDeleteAIAgentRequestType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRequestType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequestType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Request Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequestType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 7C9DB7FC-90B2-4ECF-B82A-70A97AE1F796 */

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: Permissions for vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spCreateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spUpdateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spDeleteAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequest" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequest" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunStep" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Run Steps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunStep" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."AIAgentRequestType" IS 'Lookup table categorizing the types of requests an agent can make to a human (e.g., Approval, Information, Choice, Review, Custom).';

COMMENT ON COLUMN __mj."AIAgentRequestType"."ID" IS 'Primary key for the AIAgentRequestType record.';

COMMENT ON COLUMN __mj."AIAgentRequestType"."Name" IS 'Unique display name for the request type (e.g., Approval, Information, Choice).';

COMMENT ON COLUMN __mj."AIAgentRequestType"."Description" IS 'Explains when and how this request type should be used by agents.';

COMMENT ON COLUMN __mj."AIAgentRequestType"."Icon" IS 'Font Awesome icon class for UI rendering of this request type.';

COMMENT ON COLUMN __mj."AIAgentRequest"."RequestTypeID" IS 'Foreign key to AIAgentRequestType. Categorizes the purpose of this request (Approval, Information, Choice, Review, Custom).';

COMMENT ON COLUMN __mj."AIAgentRequest"."OriginatingAgentRunID" IS 'Foreign key to AIAgentRun. The agent run that created this request. Used to trace request origin in run chains.';

COMMENT ON COLUMN __mj."AIAgentRequest"."OriginatingAgentRunStepID" IS 'Foreign key to AIAgentRunStep. The specific execution step that triggered this request.';

COMMENT ON COLUMN __mj."AIAgentRequest"."ResumingAgentRunID" IS 'Foreign key to AIAgentRun. The new agent run spawned after the human responds. NULL until a response triggers a resuming run.';

COMMENT ON COLUMN __mj."AIAgentRequest"."ResponseSchema" IS 'JSON-serialized AgentResponseForm defining the structured input form the agent presents to the human. Uses the same form types as ConversationDetail."ResponseForm".';

COMMENT ON COLUMN __mj."AIAgentRequest"."ResponseData" IS 'JSON structured response data provided by the human, conforming to the ResponseSchema definition.';

COMMENT ON COLUMN __mj."AIAgentRequest"."Priority" IS 'Urgency level of the request as an integer from 1 (lowest) to 100 (highest). Default is 50. Suggested ranges: 1-25 Low, 26-50 Normal, 51-75 High, 76-100 Critical. Used for notification routing and dashboard sorting.';

COMMENT ON COLUMN __mj."AIAgentRequest"."ExpiresAt" IS 'Optional deadline for the human to respond. After this time the request may be marked Expired by a background process.';


-- ===================== Other =====================

-- Migration: Agent Feedback Request Schema — Human-in-the-Loop Persistence
-- Enables agents to pause execution, request structured human input, and resume via linked run chains.
-- See: plans/agent-feedback-request-schema.md

------------------------------------------------------------------------
-- 1. New lookup table: AIAgentRequestType
--    Seed data is managed via /metadata/agent-request-types/ (mj-sync),
--    NOT via SQL INSERTs in this migration.
------------------------------------------------------------------------

/* spUpdate Permissions for MJ: AI Agent Request Types */

/* spUpdate Permissions for MJ: AI Agent Requests */
