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

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionContext'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionContext"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionContext"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAccessControlRule'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAccessControlRule"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AccessControlRule"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionAuthorization'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionAuthorization"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionAuthorization"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionContextType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionContextType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionContextType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionLibrary'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionLibrary"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionLibrary"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionExecutionLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionExecutionLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionFilter'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionFilter"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionFilter"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionParam"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionResultCode'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionResultCode"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionResultCode"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentAction"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAction"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentArtifactType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentArtifactType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentArtifactType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActionAuthorizations_ActionIDID UUID;
    p_MJActionContexts_ActionIDID UUID;
    p_MJActionExecutionLogs_ActionIDID UUID;
    p_MJActionLibraries_ActionIDID UUID;
    p_MJActionParams_ActionIDID UUID;
    p_MJActionResultCodes_ActionIDID UUID;
    p_MJActions_ParentIDID UUID;
    p_MJAIAgentActions_ActionIDID UUID;
    p_MJAIAgentActions_ActionID_AgentID UUID;
    p_MJAIAgentActions_ActionID_ActionID UUID;
    p_MJAIAgentActions_ActionID_Status VARCHAR(15);
    p_MJAIAgentActions_ActionID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_ActionID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_ActionID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_ActionID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_ActionID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_ActionID_CompactLength INTEGER;
    p_MJAIAgentActions_ActionID_CompactPromptID UUID;
    p_MJAIAgentSteps_ActionIDID UUID;
    p_MJAIAgentSteps_ActionID_AgentID UUID;
    p_MJAIAgentSteps_ActionID_Name VARCHAR(255);
    p_MJAIAgentSteps_ActionID_Description TEXT;
    p_MJAIAgentSteps_ActionID_StepType VARCHAR(20);
    p_MJAIAgentSteps_ActionID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_ActionID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_ActionID_RetryCount INTEGER;
    p_MJAIAgentSteps_ActionID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_ActionID_ActionID UUID;
    p_MJAIAgentSteps_ActionID_SubAgentID UUID;
    p_MJAIAgentSteps_ActionID_PromptID UUID;
    p_MJAIAgentSteps_ActionID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_ActionID_PositionX INTEGER;
    p_MJAIAgentSteps_ActionID_PositionY INTEGER;
    p_MJAIAgentSteps_ActionID_Width INTEGER;
    p_MJAIAgentSteps_ActionID_Height INTEGER;
    p_MJAIAgentSteps_ActionID_Status VARCHAR(20);
    p_MJAIAgentSteps_ActionID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_ActionID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_ActionID_Configuration TEXT;
    p_MJEntityActions_ActionIDID UUID;
    p_MJMCPServerTools_GeneratedActionIDID UUID;
    p_MJMCPServerTools_GeneratedActionID_MCPServerID UUID;
    p_MJMCPServerTools_GeneratedActionID_ToolName VARCHAR(255);
    p_MJMCPServerTools_GeneratedActionID_ToolTitle VARCHAR(255);
    p_MJMCPServerTools_GeneratedActionID_ToolDescription TEXT;
    p_MJMCPServerTools_GeneratedActionID_InputSchema TEXT;
    p_MJMCPServerTools_GeneratedActionID_OutputSchema TEXT;
    p_MJMCPServerTools_GeneratedActionID_Annotations TEXT;
    p_MJMCPServerTools_GeneratedActionID_Status VARCHAR(50);
    p_MJMCPServerTools_GeneratedActionID_DiscoveredAt TIMESTAMPTZ;
    p_MJMCPServerTools_GeneratedActionID_LastSeenAt TIMESTAMPTZ;
    p_MJMCPServerTools_GeneratedActionID_GeneratedActionID UUID;
    p_MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID UUID;
    p_MJScheduledActions_ActionIDID UUID;
BEGIN
-- Cascade delete from ActionAuthorization using cursor to call spDeleteActionAuthorization

    FOR _rec IN SELECT "ID" FROM __mj."ActionAuthorization" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionAuthorizations_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionAuthorization"(p_ID => p_MJActionAuthorizations_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionContext using cursor to call spDeleteActionContext

    FOR _rec IN SELECT "ID" FROM __mj."ActionContext" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionContexts_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionContext"(p_ID => p_MJActionContexts_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionExecutionLog using cursor to call spDeleteActionExecutionLog

    FOR _rec IN SELECT "ID" FROM __mj."ActionExecutionLog" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionExecutionLogs_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionExecutionLog"(p_ID => p_MJActionExecutionLogs_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionLibrary using cursor to call spDeleteActionLibrary

    FOR _rec IN SELECT "ID" FROM __mj."ActionLibrary" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionLibraries_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionLibrary"(p_ID => p_MJActionLibraries_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionParam using cursor to call spDeleteActionParam

    FOR _rec IN SELECT "ID" FROM __mj."ActionParam" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionParams_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionParam"(p_ID => p_MJActionParams_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionResultCode using cursor to call spDeleteActionResultCode

    FOR _rec IN SELECT "ID" FROM __mj."ActionResultCode" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionResultCodes_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionResultCode"(p_ID => p_MJActionResultCodes_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from Action using cursor to call spDeleteAction

    FOR _rec IN SELECT "ID" FROM __mj."Action" WHERE "ParentID" = p_ID
    LOOP
        p_MJActions_ParentIDID := _rec."ID";
        PERFORM __mj."spDeleteAction"(p_ID => p_MJActions_ParentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJAIAgentActions_ActionIDID := _rec."ID";
        p_MJAIAgentActions_ActionID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_ActionID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_ActionID_Status := _rec."Status";
        p_MJAIAgentActions_ActionID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_ActionID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_ActionID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_ActionID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_ActionID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_ActionID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_ActionID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_ActionID_ActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_ActionIDID, p_AgentID => p_MJAIAgentActions_ActionID_AgentID, p_ActionID_Clear => 1, p_ActionID => p_MJAIAgentActions_ActionID_ActionID, p_Status => p_MJAIAgentActions_ActionID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_ActionID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_ActionID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_ActionID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_ActionID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_ActionID_CompactMode, p_CompactLength => p_MJAIAgentActions_ActionID_CompactLength, p_CompactPromptID => p_MJAIAgentActions_ActionID_CompactPromptID);

    END LOOP;

    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "ActionID" = p_ID
    LOOP
        p_MJAIAgentSteps_ActionIDID := _rec."ID";
        p_MJAIAgentSteps_ActionID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_ActionID_Name := _rec."Name";
        p_MJAIAgentSteps_ActionID_Description := _rec."Description";
        p_MJAIAgentSteps_ActionID_StepType := _rec."StepType";
        p_MJAIAgentSteps_ActionID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_ActionID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_ActionID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_ActionID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_ActionID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_ActionID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_ActionID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_ActionID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_ActionID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_ActionID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_ActionID_Width := _rec."Width";
        p_MJAIAgentSteps_ActionID_Height := _rec."Height";
        p_MJAIAgentSteps_ActionID_Status := _rec."Status";
        p_MJAIAgentSteps_ActionID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_ActionID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_ActionID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_ActionID_ActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_ActionIDID, p_AgentID => p_MJAIAgentSteps_ActionID_AgentID, p_Name => p_MJAIAgentSteps_ActionID_Name, p_Description => p_MJAIAgentSteps_ActionID_Description, p_StepType => p_MJAIAgentSteps_ActionID_StepType, p_StartingStep => p_MJAIAgentSteps_ActionID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_ActionID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_ActionID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_ActionID_OnErrorBehavior, p_ActionID_Clear => 1, p_ActionID => p_MJAIAgentSteps_ActionID_ActionID, p_SubAgentID => p_MJAIAgentSteps_ActionID_SubAgentID, p_PromptID => p_MJAIAgentSteps_ActionID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_ActionID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_ActionID_PositionX, p_PositionY => p_MJAIAgentSteps_ActionID_PositionY, p_Width => p_MJAIAgentSteps_ActionID_Width, p_Height => p_MJAIAgentSteps_ActionID_Height, p_Status => p_MJAIAgentSteps_ActionID_Status, p_ActionInputMapping => p_MJAIAgentSteps_ActionID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_ActionID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_ActionID_Configuration);

    END LOOP;

    
    -- Cascade delete from EntityAction using cursor to call spDeleteEntityAction

    FOR _rec IN SELECT "ID" FROM __mj."EntityAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJEntityActions_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityAction"(p_ID => p_MJEntityActions_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade update on MCPServerTool using cursor to call spUpdateMCPServerTool


    FOR _rec IN SELECT "ID", "MCPServerID", "ToolName", "ToolTitle", "ToolDescription", "InputSchema", "OutputSchema", "Annotations", "Status", "DiscoveredAt", "LastSeenAt", "GeneratedActionID", "GeneratedActionCategoryID" FROM __mj."MCPServerTool" WHERE "GeneratedActionID" = p_ID
    LOOP
        p_MJMCPServerTools_GeneratedActionIDID := _rec."ID";
        p_MJMCPServerTools_GeneratedActionID_MCPServerID := _rec."MCPServerID";
        p_MJMCPServerTools_GeneratedActionID_ToolName := _rec."ToolName";
        p_MJMCPServerTools_GeneratedActionID_ToolTitle := _rec."ToolTitle";
        p_MJMCPServerTools_GeneratedActionID_ToolDescription := _rec."ToolDescription";
        p_MJMCPServerTools_GeneratedActionID_InputSchema := _rec."InputSchema";
        p_MJMCPServerTools_GeneratedActionID_OutputSchema := _rec."OutputSchema";
        p_MJMCPServerTools_GeneratedActionID_Annotations := _rec."Annotations";
        p_MJMCPServerTools_GeneratedActionID_Status := _rec."Status";
        p_MJMCPServerTools_GeneratedActionID_DiscoveredAt := _rec."DiscoveredAt";
        p_MJMCPServerTools_GeneratedActionID_LastSeenAt := _rec."LastSeenAt";
        p_MJMCPServerTools_GeneratedActionID_GeneratedActionID := _rec."GeneratedActionID";
        p_MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID := _rec."GeneratedActionCategoryID";
        -- Set the FK field to NULL
        p_MJMCPServerTools_GeneratedActionID_GeneratedActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateMCPServerTool"(p_ID => p_MJMCPServerTools_GeneratedActionIDID, p_MCPServerID => p_MJMCPServerTools_GeneratedActionID_MCPServerID, p_ToolName => p_MJMCPServerTools_GeneratedActionID_ToolName, p_ToolTitle => p_MJMCPServerTools_GeneratedActionID_ToolTitle, p_ToolDescription => p_MJMCPServerTools_GeneratedActionID_ToolDescription, p_InputSchema => p_MJMCPServerTools_GeneratedActionID_InputSchema, p_OutputSchema => p_MJMCPServerTools_GeneratedActionID_OutputSchema, p_Annotations => p_MJMCPServerTools_GeneratedActionID_Annotations, p_Status => p_MJMCPServerTools_GeneratedActionID_Status, p_DiscoveredAt => p_MJMCPServerTools_GeneratedActionID_DiscoveredAt, p_LastSeenAt => p_MJMCPServerTools_GeneratedActionID_LastSeenAt, p_GeneratedActionID_Clear => 1, p_GeneratedActionID => p_MJMCPServerTools_GeneratedActionID_GeneratedActionID, p_GeneratedActionCategoryID => p_MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID);

    END LOOP;

    
    -- Cascade delete from ScheduledAction using cursor to call spDeleteScheduledAction

    FOR _rec IN SELECT "ID" FROM __mj."ScheduledAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJScheduledActions_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteScheduledAction"(p_ID => p_MJScheduledActions_ActionIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Action"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentExample'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentExample"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentExample"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentDataSource'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentDataSource"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentDataSource"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentClientTool'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentLearningCycle'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentLearningCycle"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentLearningCycle"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentConfiguration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentConfiguration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentConfiguration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentModel'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentModel"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentModel"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentModality'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentModality"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentModality"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentNoteType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNoteType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentNoteType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentNote'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNote"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentNote"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRelationship'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRelationship"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentRelationship"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRequestType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentPrompt'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentPrompt"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentPrompt"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRequest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRunMedia'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunMedia"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentRunMedia"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentStep'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentStep"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentStepPaths_OriginStepIDID UUID;
    p_MJAIAgentStepPaths_DestinationStepIDID UUID;
BEGIN
-- Cascade delete from AIAgentStepPath using cursor to call spDeleteAIAgentStepPath

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentStepPath" WHERE "OriginStepID" = p_ID
    LOOP
        p_MJAIAgentStepPaths_OriginStepIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentStepPath"(p_ID => p_MJAIAgentStepPaths_OriginStepIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentStepPath using cursor to call spDeleteAIAgentStepPath

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentStepPath" WHERE "DestinationStepID" = p_ID
    LOOP
        p_MJAIAgentStepPaths_DestinationStepIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentStepPath"(p_ID => p_MJAIAgentStepPaths_DestinationStepIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."AIAgentStep"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentStepPath'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentStepPath"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentStepPath"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRunStep'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource VARCHAR(20);
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


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID", "ResponseSource" FROM __mj."AIAgentRequest" WHERE "OriginatingAgentRunStepID" = p_ID
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
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource := _rec."ResponseSource";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_ID => p_MJAIAgentRequests_OriginatingAgentRunStepIDID, p_AgentID => p_MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, p_RequestedAt => p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, p_RequestForUserID => p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, p_Status => p_MJAIAgentRequests_OriginatingAgentRunStepID_Status, p_Request => p_MJAIAgentRequests_OriginatingAgentRunStepID_Request, p_Response => p_MJAIAgentRequests_OriginatingAgentRunStepID_Response, p_ResponseByUserID => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, p_RespondedAt => p_MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, p_Comments => p_MJAIAgentRequests_OriginatingAgentRunStepID_Comments, p_RequestTypeID => p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, p_ResponseSchema => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, p_ResponseData => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, p_Priority => p_MJAIAgentRequests_OriginatingAgentRunStepID_Priority, p_ExpiresAt => p_MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, p_OriginatingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_0a03b4, p_OriginatingAgentRunStepID_Clear => 1, p_OriginatingAgentRunStepID => p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246, p_ResumingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAge_3f1d42, p_ResponseSource => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource);

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
        PERFORM __mj."spUpdateAIAgentRunStep"(p_ID => p_MJAIAgentRunSteps_ParentIDID, p_AgentRunID => p_MJAIAgentRunSteps_ParentID_AgentRunID, p_StepNumber => p_MJAIAgentRunSteps_ParentID_StepNumber, p_StepType => p_MJAIAgentRunSteps_ParentID_StepType, p_StepName => p_MJAIAgentRunSteps_ParentID_StepName, p_TargetID => p_MJAIAgentRunSteps_ParentID_TargetID, p_Status => p_MJAIAgentRunSteps_ParentID_Status, p_StartedAt => p_MJAIAgentRunSteps_ParentID_StartedAt, p_CompletedAt => p_MJAIAgentRunSteps_ParentID_CompletedAt, p_Success => p_MJAIAgentRunSteps_ParentID_Success, p_ErrorMessage => p_MJAIAgentRunSteps_ParentID_ErrorMessage, p_InputData => p_MJAIAgentRunSteps_ParentID_InputData, p_OutputData => p_MJAIAgentRunSteps_ParentID_OutputData, p_TargetLogID => p_MJAIAgentRunSteps_ParentID_TargetLogID, p_PayloadAtStart => p_MJAIAgentRunSteps_ParentID_PayloadAtStart, p_PayloadAtEnd => p_MJAIAgentRunSteps_ParentID_PayloadAtEnd, p_FinalPayloadValidationResult => p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, p_FinalPayloadValidationMessages => p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgentRunSteps_ParentID_ParentID, p_Comments => p_MJAIAgentRunSteps_ParentID_Comments);

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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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
    p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore NUMERIC(5,2);
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
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSource VARCHAR(20);
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
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseSource VARCHAR(20);
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
    p_MJAIAgentRuns_ParentRunID_CompanyID UUID;
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
    p_MJAIAgentRuns_LastRunID_CompanyID UUID;
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
    p_MJAIPromptRuns_AgentRunID_AssistantPrefill TEXT;
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
        PERFORM __mj."spUpdateAIAgentExample"(p_ID => p_MJAIAgentExamples_SourceAIAgentRunIDID, p_AgentID => p_MJAIAgentExamples_SourceAIAgentRunID_AgentID, p_UserID => p_MJAIAgentExamples_SourceAIAgentRunID_UserID, p_CompanyID => p_MJAIAgentExamples_SourceAIAgentRunID_CompanyID, p_Type => p_MJAIAgentExamples_SourceAIAgentRunID_Type, p_ExampleInput => p_MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, p_ExampleOutput => p_MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, p_IsAutoGenerated => p_MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, p_SourceConversationID => p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversation_a05cb8, p_SourceAIAgentRunID_Clear => 1, p_SourceAIAgentRunID => p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, p_SuccessScore => p_MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, p_Comments => p_MJAIAgentExamples_SourceAIAgentRunID_Comments, p_Status => p_MJAIAgentExamples_SourceAIAgentRunID_Status, p_EmbeddingVector => p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, p_AccessCount => p_MJAIAgentExamples_SourceAIAgentRunID_AccessCount, p_ExpiresAt => p_MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore" FROM __mj."AIAgentNote" WHERE "SourceAIAgentRunID" = p_ID
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
        p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore := _rec."ImportanceScore";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceAIAgentRunIDID, p_AgentID => p_MJAIAgentNotes_SourceAIAgentRunID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceAIAgentRunID_Note, p_UserID => p_MJAIAgentNotes_SourceAIAgentRunID_UserID, p_Type => p_MJAIAgentNotes_SourceAIAgentRunID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceAIAgentRunID_Comments, p_Status => p_MJAIAgentNotes_SourceAIAgentRunID_Status, p_SourceConversationID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, p_SourceAIAgentRunID_Clear => 1, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore);

    END LOOP;

    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID", "ResponseSource" FROM __mj."AIAgentRequest" WHERE "OriginatingAgentRunID" = p_ID
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
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSource := _rec."ResponseSource";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_ID => p_MJAIAgentRequests_OriginatingAgentRunIDID, p_AgentID => p_MJAIAgentRequests_OriginatingAgentRunID_AgentID, p_RequestedAt => p_MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, p_RequestForUserID => p_MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, p_Status => p_MJAIAgentRequests_OriginatingAgentRunID_Status, p_Request => p_MJAIAgentRequests_OriginatingAgentRunID_Request, p_Response => p_MJAIAgentRequests_OriginatingAgentRunID_Response, p_ResponseByUserID => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, p_RespondedAt => p_MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, p_Comments => p_MJAIAgentRequests_OriginatingAgentRunID_Comments, p_RequestTypeID => p_MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, p_ResponseSchema => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, p_ResponseData => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseData, p_Priority => p_MJAIAgentRequests_OriginatingAgentRunID_Priority, p_ExpiresAt => p_MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, p_OriginatingAgentRunID_Clear => 1, p_OriginatingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, p_OriginatingAgentRunStepID => p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgen_2294cf, p_ResumingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, p_ResponseSource => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSource);

    END LOOP;

    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID", "ResponseSource" FROM __mj."AIAgentRequest" WHERE "ResumingAgentRunID" = p_ID
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
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseSource := _rec."ResponseSource";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_ID => p_MJAIAgentRequests_ResumingAgentRunIDID, p_AgentID => p_MJAIAgentRequests_ResumingAgentRunID_AgentID, p_RequestedAt => p_MJAIAgentRequests_ResumingAgentRunID_RequestedAt, p_RequestForUserID => p_MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, p_Status => p_MJAIAgentRequests_ResumingAgentRunID_Status, p_Request => p_MJAIAgentRequests_ResumingAgentRunID_Request, p_Response => p_MJAIAgentRequests_ResumingAgentRunID_Response, p_ResponseByUserID => p_MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, p_RespondedAt => p_MJAIAgentRequests_ResumingAgentRunID_RespondedAt, p_Comments => p_MJAIAgentRequests_ResumingAgentRunID_Comments, p_RequestTypeID => p_MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, p_ResponseSchema => p_MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, p_ResponseData => p_MJAIAgentRequests_ResumingAgentRunID_ResponseData, p_Priority => p_MJAIAgentRequests_ResumingAgentRunID_Priority, p_ExpiresAt => p_MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, p_OriginatingAgentRunID => p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, p_OriginatingAgentRunStepID => p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRu_4faa57, p_ResumingAgentRunID_Clear => 1, p_ResumingAgentRunID => p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, p_ResponseSource => p_MJAIAgentRequests_ResumingAgentRunID_ResponseSource);

    END LOOP;

    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRunMedia" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIAgentRunMedias_AgentRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRunMedia"(p_ID => p_MJAIAgentRunMedias_AgentRunIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRunStep" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIAgentRunSteps_AgentRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRunStep"(p_ID => p_MJAIAgentRunSteps_AgentRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "ParentRunID" = p_ID
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
        p_MJAIAgentRuns_ParentRunID_CompanyID := _rec."CompanyID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ParentRunID_ParentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ParentRunIDID, p_AgentID => p_MJAIAgentRuns_ParentRunID_AgentID, p_ParentRunID_Clear => 1, p_ParentRunID => p_MJAIAgentRuns_ParentRunID_ParentRunID, p_Status => p_MJAIAgentRuns_ParentRunID_Status, p_StartedAt => p_MJAIAgentRuns_ParentRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ParentRunID_CompletedAt, p_Success => p_MJAIAgentRuns_ParentRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_ParentRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ParentRunID_ConversationID, p_UserID => p_MJAIAgentRuns_ParentRunID_UserID, p_Result => p_MJAIAgentRuns_ParentRunID_Result, p_AgentState => p_MJAIAgentRuns_ParentRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ParentRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ParentRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ParentRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ParentRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ParentRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ParentRunID_FinalPayload, p_Message => p_MJAIAgentRuns_ParentRunID_Message, p_LastRunID => p_MJAIAgentRuns_ParentRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ParentRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ParentRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ParentRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ParentRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ParentRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ParentRunID_Data, p_Verbose => p_MJAIAgentRuns_ParentRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ParentRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_ParentRunID_RunName, p_Comments => p_MJAIAgentRuns_ParentRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ParentRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ParentRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ParentRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ParentRunID_CompanyID);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "LastRunID" = p_ID
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
        p_MJAIAgentRuns_LastRunID_CompanyID := _rec."CompanyID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_LastRunID_LastRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_LastRunIDID, p_AgentID => p_MJAIAgentRuns_LastRunID_AgentID, p_ParentRunID => p_MJAIAgentRuns_LastRunID_ParentRunID, p_Status => p_MJAIAgentRuns_LastRunID_Status, p_StartedAt => p_MJAIAgentRuns_LastRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_LastRunID_CompletedAt, p_Success => p_MJAIAgentRuns_LastRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_LastRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_LastRunID_ConversationID, p_UserID => p_MJAIAgentRuns_LastRunID_UserID, p_Result => p_MJAIAgentRuns_LastRunID_Result, p_AgentState => p_MJAIAgentRuns_LastRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_LastRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_LastRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_LastRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_LastRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_LastRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_LastRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_LastRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_LastRunID_FinalPayload, p_Message => p_MJAIAgentRuns_LastRunID_Message, p_LastRunID_Clear => 1, p_LastRunID => p_MJAIAgentRuns_LastRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_LastRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_LastRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_LastRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_LastRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_LastRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_LastRunID_Data, p_Verbose => p_MJAIAgentRuns_LastRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_LastRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_LastRunID_RunName, p_Comments => p_MJAIAgentRuns_LastRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_LastRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_LastRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_LastRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_LastRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_LastRunID_CompanyID);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "AgentRunID" = p_ID
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
        p_MJAIPromptRuns_AgentRunID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentRunIDID, p_PromptID => p_MJAIPromptRuns_AgentRunID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentRunID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentRunID_VendorID, p_AgentID => p_MJAIPromptRuns_AgentRunID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentRunID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentRunID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentRunID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentRunID_Messages, p_Result => p_MJAIPromptRuns_AgentRunID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentRunID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentRunID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentRunID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentRunID_TotalCost, p_Success => p_MJAIPromptRuns_AgentRunID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentRunID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentRunID_ParentID, p_RunType => p_MJAIPromptRuns_AgentRunID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentRunID_ExecutionOrder, p_AgentRunID_Clear => 1, p_AgentRunID => p_MJAIPromptRuns_AgentRunID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentRunID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentRunID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentRunID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentRunID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentRunID_Temperature, p_TopP => p_MJAIPromptRuns_AgentRunID_TopP, p_TopK => p_MJAIPromptRuns_AgentRunID_TopK, p_MinP => p_MJAIPromptRuns_AgentRunID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentRunID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentRunID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentRunID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentRunID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentRunID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentRunID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentRunID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentRunID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentRunID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentRunID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentRunID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentRunID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentRunID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentRunID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentRunID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentRunID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentRunID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentRunID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentRunID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentRunID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentRunID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentRunID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentRunID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentRunID_Status, p_Cancelled => p_MJAIPromptRuns_AgentRunID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentRunID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentRunID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentRunID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentRunID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentRunID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentRunID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentRunID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentRunID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentRunID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentRunID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentRunID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentRunID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentRunID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentRunID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentRunID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentRunID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentRunID_RunName, p_Comments => p_MJAIPromptRuns_AgentRunID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentRunID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentRunID_AssistantPrefill);

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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIArchitecture'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIArchitecture"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIArchitecture"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIConfigurationParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIConfigurationParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIConfigurationParam"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIClientToolDefinition'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIConfiguration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIConfiguration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentConfigurations_AIConfigurationIDID UUID;
    p_MJAIAgentConfigurations_AIConfigurationID_AgentID UUID;
    p_MJAIAgentConfigurations_AIConfigurationID_Name VARCHAR(100);
    p_MJAIAgentConfigurations_AIConfigurationID_DisplayName VARCHAR(200);
    p_MJAIAgentConfigurations_AIConfigurationID_Description TEXT;
    p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID UUID;
    p_MJAIAgentConfigurations_AIConfigurationID_IsDefault BOOLEAN;
    p_MJAIAgentConfigurations_AIConfigurationID_Priority INTEGER;
    p_MJAIAgentConfigurations_AIConfigurationID_Status VARCHAR(20);
    p_MJAIAgentPrompts_ConfigurationIDID UUID;
    p_MJAIAgentRuns_ConfigurationIDID UUID;
    p_MJAIAgentRuns_ConfigurationID_AgentID UUID;
    p_MJAIAgentRuns_ConfigurationID_ParentRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_Status VARCHAR(50);
    p_MJAIAgentRuns_ConfigurationID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConfigurationID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConfigurationID_Success BOOLEAN;
    p_MJAIAgentRuns_ConfigurationID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ConfigurationID_ConversationID UUID;
    p_MJAIAgentRuns_ConfigurationID_UserID UUID;
    p_MJAIAgentRuns_ConfigurationID_Result TEXT;
    p_MJAIAgentRuns_ConfigurationID_AgentState TEXT;
    p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ConfigurationID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ConfigurationID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ConfigurationID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ConfigurationID_FinalPayload TEXT;
    p_MJAIAgentRuns_ConfigurationID_Message TEXT;
    p_MJAIAgentRuns_ConfigurationID_LastRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_StartingPayload TEXT;
    p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ConfigurationID_ConfigurationID UUID;
    p_MJAIAgentRuns_ConfigurationID_OverrideModelID UUID;
    p_MJAIAgentRuns_ConfigurationID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ConfigurationID_Data TEXT;
    p_MJAIAgentRuns_ConfigurationID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ConfigurationID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ConfigurationID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ConfigurationID_Comments TEXT;
    p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_TestRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ConfigurationID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ConfigurationID_CompanyID UUID;
    p_MJAIConfigurationParams_ConfigurationIDID UUID;
    p_MJAIConfigurations_ParentIDID UUID;
    p_MJAIConfigurations_ParentID_Name VARCHAR(100);
    p_MJAIConfigurations_ParentID_Description TEXT;
    p_MJAIConfigurations_ParentID_IsDefault BOOLEAN;
    p_MJAIConfigurations_ParentID_Status VARCHAR(20);
    p_MJAIConfigurations_ParentID_DefaultPromptForContextComp_77efd6 UUID;
    p_MJAIConfigurations_ParentID_DefaultPromptForContextSumm_ff5147 UUID;
    p_MJAIConfigurations_ParentID_DefaultStorageProviderID UUID;
    p_MJAIConfigurations_ParentID_DefaultStorageRootPath VARCHAR(500);
    p_MJAIConfigurations_ParentID_ParentID UUID;
    p_MJAIPromptModels_ConfigurationIDID UUID;
    p_MJAIPromptRuns_ConfigurationIDID UUID;
    p_MJAIPromptRuns_ConfigurationID_PromptID UUID;
    p_MJAIPromptRuns_ConfigurationID_ModelID UUID;
    p_MJAIPromptRuns_ConfigurationID_VendorID UUID;
    p_MJAIPromptRuns_ConfigurationID_AgentID UUID;
    p_MJAIPromptRuns_ConfigurationID_ConfigurationID UUID;
    p_MJAIPromptRuns_ConfigurationID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ConfigurationID_Messages TEXT;
    p_MJAIPromptRuns_ConfigurationID_Result TEXT;
    p_MJAIPromptRuns_ConfigurationID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ConfigurationID_Success BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ConfigurationID_ParentID UUID;
    p_MJAIPromptRuns_ConfigurationID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ConfigurationID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ConfigurationID_AgentRunID UUID;
    p_MJAIPromptRuns_ConfigurationID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ConfigurationID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ConfigurationID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_TopK INTEGER;
    p_MJAIPromptRuns_ConfigurationID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_Seed INTEGER;
    p_MJAIPromptRuns_ConfigurationID_StopSequences TEXT;
    p_MJAIPromptRuns_ConfigurationID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ConfigurationID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ConfigurationID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ConfigurationID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ConfigurationID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ConfigurationID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ConfigurationID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ConfigurationID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ConfigurationID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ConfigurationID_OriginalModelID UUID;
    p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ConfigurationID_ModelSelection TEXT;
    p_MJAIPromptRuns_ConfigurationID_Status VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_CancellationReason TEXT;
    p_MJAIPromptRuns_ConfigurationID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ConfigurationID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ConfigurationID_JudgeID UUID;
    p_MJAIPromptRuns_ConfigurationID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ConfigurationID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ConfigurationID_ChildPromptID UUID;
    p_MJAIPromptRuns_ConfigurationID_QueueTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_PromptTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ConfigurationID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ConfigurationID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ConfigurationID_Comments TEXT;
    p_MJAIPromptRuns_ConfigurationID_TestRunID UUID;
    p_MJAIPromptRuns_ConfigurationID_AssistantPrefill TEXT;
    p_MJAIResultCache_ConfigurationIDID UUID;
    p_MJAIResultCache_ConfigurationID_AIPromptID UUID;
    p_MJAIResultCache_ConfigurationID_AIModelID UUID;
    p_MJAIResultCache_ConfigurationID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_ConfigurationID_PromptText TEXT;
    p_MJAIResultCache_ConfigurationID_ResultText TEXT;
    p_MJAIResultCache_ConfigurationID_Status VARCHAR(50);
    p_MJAIResultCache_ConfigurationID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_ConfigurationID_VendorID UUID;
    p_MJAIResultCache_ConfigurationID_AgentID UUID;
    p_MJAIResultCache_ConfigurationID_ConfigurationID UUID;
    p_MJAIResultCache_ConfigurationID_PromptEmbedding BYTEA;
    p_MJAIResultCache_ConfigurationID_PromptRunID UUID;
BEGIN
-- Cascade update on AIAgentConfiguration using cursor to call spUpdateAIAgentConfiguration


    FOR _rec IN SELECT "ID", "AgentID", "Name", "DisplayName", "Description", "AIConfigurationID", "IsDefault", "Priority", "Status" FROM __mj."AIAgentConfiguration" WHERE "AIConfigurationID" = p_ID
    LOOP
        p_MJAIAgentConfigurations_AIConfigurationIDID := _rec."ID";
        p_MJAIAgentConfigurations_AIConfigurationID_AgentID := _rec."AgentID";
        p_MJAIAgentConfigurations_AIConfigurationID_Name := _rec."Name";
        p_MJAIAgentConfigurations_AIConfigurationID_DisplayName := _rec."DisplayName";
        p_MJAIAgentConfigurations_AIConfigurationID_Description := _rec."Description";
        p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID := _rec."AIConfigurationID";
        p_MJAIAgentConfigurations_AIConfigurationID_IsDefault := _rec."IsDefault";
        p_MJAIAgentConfigurations_AIConfigurationID_Priority := _rec."Priority";
        p_MJAIAgentConfigurations_AIConfigurationID_Status := _rec."Status";
        -- Set the FK field to NULL
        p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentConfiguration"(p_ID => p_MJAIAgentConfigurations_AIConfigurationIDID, p_AgentID => p_MJAIAgentConfigurations_AIConfigurationID_AgentID, p_Name => p_MJAIAgentConfigurations_AIConfigurationID_Name, p_DisplayName => p_MJAIAgentConfigurations_AIConfigurationID_DisplayName, p_Description => p_MJAIAgentConfigurations_AIConfigurationID_Description, p_AIConfigurationID_Clear => 1, p_AIConfigurationID => p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, p_IsDefault => p_MJAIAgentConfigurations_AIConfigurationID_IsDefault, p_Priority => p_MJAIAgentConfigurations_AIConfigurationID_Priority, p_Status => p_MJAIAgentConfigurations_AIConfigurationID_Status);

    END LOOP;

    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIAgentPrompts_ConfigurationIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIAgentRuns_ConfigurationIDID := _rec."ID";
        p_MJAIAgentRuns_ConfigurationID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ConfigurationID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ConfigurationID_Status := _rec."Status";
        p_MJAIAgentRuns_ConfigurationID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ConfigurationID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ConfigurationID_Success := _rec."Success";
        p_MJAIAgentRuns_ConfigurationID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ConfigurationID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ConfigurationID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ConfigurationID_Result := _rec."Result";
        p_MJAIAgentRuns_ConfigurationID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ConfigurationID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ConfigurationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ConfigurationID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ConfigurationID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ConfigurationID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ConfigurationID_Message := _rec."Message";
        p_MJAIAgentRuns_ConfigurationID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ConfigurationID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ConfigurationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ConfigurationID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ConfigurationID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ConfigurationID_Data := _rec."Data";
        p_MJAIAgentRuns_ConfigurationID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ConfigurationID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ConfigurationID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ConfigurationID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ConfigurationID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ConfigurationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ConfigurationID_CompanyID := _rec."CompanyID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConfigurationIDID, p_AgentID => p_MJAIAgentRuns_ConfigurationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConfigurationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConfigurationID_Status, p_StartedAt => p_MJAIAgentRuns_ConfigurationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConfigurationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConfigurationID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConfigurationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConfigurationID_UserID, p_Result => p_MJAIAgentRuns_ConfigurationID_Result, p_AgentState => p_MJAIAgentRuns_ConfigurationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConfigurationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConfigurationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConfigurationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConfigurationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConfigurationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConfigurationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConfigurationID_Message, p_LastRunID => p_MJAIAgentRuns_ConfigurationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConfigurationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIAgentRuns_ConfigurationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConfigurationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConfigurationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConfigurationID_Data, p_Verbose => p_MJAIAgentRuns_ConfigurationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConfigurationID_RunName, p_Comments => p_MJAIAgentRuns_ConfigurationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConfigurationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConfigurationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConfigurationID_CompanyID);

    END LOOP;

    
    -- Cascade delete from AIConfigurationParam using cursor to call spDeleteAIConfigurationParam

    FOR _rec IN SELECT "ID" FROM __mj."AIConfigurationParam" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIConfigurationParams_ConfigurationIDID := _rec."ID";
        PERFORM __mj."spDeleteAIConfigurationParam"(p_ID => p_MJAIConfigurationParams_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIConfigurations_ParentIDID := _rec."ID";
        p_MJAIConfigurations_ParentID_Name := _rec."Name";
        p_MJAIConfigurations_ParentID_Description := _rec."Description";
        p_MJAIConfigurations_ParentID_IsDefault := _rec."IsDefault";
        p_MJAIConfigurations_ParentID_Status := _rec."Status";
        p_MJAIConfigurations_ParentID_DefaultPromptForContextComp_77efd6 := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_ParentID_DefaultPromptForContextSumm_ff5147 := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_ParentID_DefaultStorageProviderID := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_ParentID_DefaultStorageRootPath := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_ParentID_ParentID := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_ParentIDID, p_Name => p_MJAIConfigurations_ParentID_Name, p_Description => p_MJAIConfigurations_ParentID_Description, p_IsDefault => p_MJAIConfigurations_ParentID_IsDefault, p_Status => p_MJAIConfigurations_ParentID_Status, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_ParentID_DefaultPromptForContextComp_77efd6, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_ParentID_DefaultPromptForContextSumm_ff5147, p_DefaultStorageProviderID => p_MJAIConfigurations_ParentID_DefaultStorageProviderID, p_DefaultStorageRootPath => p_MJAIConfigurations_ParentID_DefaultStorageRootPath, p_ParentID_Clear => 1, p_ParentID => p_MJAIConfigurations_ParentID_ParentID);

    END LOOP;

    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptModel" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIPromptModels_ConfigurationIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptModel"(p_ID => p_MJAIPromptModels_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIPromptRuns_ConfigurationIDID := _rec."ID";
        p_MJAIPromptRuns_ConfigurationID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ConfigurationID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ConfigurationID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ConfigurationID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ConfigurationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ConfigurationID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ConfigurationID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ConfigurationID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ConfigurationID_Result := _rec."Result";
        p_MJAIPromptRuns_ConfigurationID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ConfigurationID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ConfigurationID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ConfigurationID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ConfigurationID_Success := _rec."Success";
        p_MJAIPromptRuns_ConfigurationID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ConfigurationID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ConfigurationID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ConfigurationID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ConfigurationID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ConfigurationID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ConfigurationID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ConfigurationID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ConfigurationID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ConfigurationID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ConfigurationID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ConfigurationID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ConfigurationID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ConfigurationID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ConfigurationID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ConfigurationID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ConfigurationID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ConfigurationID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ConfigurationID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ConfigurationID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ConfigurationID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ConfigurationID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ConfigurationID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ConfigurationID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ConfigurationID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ConfigurationID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ConfigurationID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ConfigurationID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ConfigurationID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ConfigurationID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ConfigurationID_Status := _rec."Status";
        p_MJAIPromptRuns_ConfigurationID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ConfigurationID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ConfigurationID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ConfigurationID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ConfigurationID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ConfigurationID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ConfigurationID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ConfigurationID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ConfigurationID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ConfigurationID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ConfigurationID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ConfigurationID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ConfigurationID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ConfigurationID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ConfigurationID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ConfigurationID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ConfigurationID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ConfigurationID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ConfigurationID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ConfigurationID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_ConfigurationID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ConfigurationIDID, p_PromptID => p_MJAIPromptRuns_ConfigurationID_PromptID, p_ModelID => p_MJAIPromptRuns_ConfigurationID_ModelID, p_VendorID => p_MJAIPromptRuns_ConfigurationID_VendorID, p_AgentID => p_MJAIPromptRuns_ConfigurationID_AgentID, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIPromptRuns_ConfigurationID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ConfigurationID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ConfigurationID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ConfigurationID_Messages, p_Result => p_MJAIPromptRuns_ConfigurationID_Result, p_TokensUsed => p_MJAIPromptRuns_ConfigurationID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ConfigurationID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ConfigurationID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ConfigurationID_TotalCost, p_Success => p_MJAIPromptRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIPromptRuns_ConfigurationID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ConfigurationID_ParentID, p_RunType => p_MJAIPromptRuns_ConfigurationID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ConfigurationID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ConfigurationID_AgentRunID, p_Cost => p_MJAIPromptRuns_ConfigurationID_Cost, p_CostCurrency => p_MJAIPromptRuns_ConfigurationID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ConfigurationID_Temperature, p_TopP => p_MJAIPromptRuns_ConfigurationID_TopP, p_TopK => p_MJAIPromptRuns_ConfigurationID_TopK, p_MinP => p_MJAIPromptRuns_ConfigurationID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ConfigurationID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ConfigurationID_Seed, p_StopSequences => p_MJAIPromptRuns_ConfigurationID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ConfigurationID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ConfigurationID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ConfigurationID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ConfigurationID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ConfigurationID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ConfigurationID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ConfigurationID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ConfigurationID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ConfigurationID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ConfigurationID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ConfigurationID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ConfigurationID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ConfigurationID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ConfigurationID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ConfigurationID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ConfigurationID_ModelSelection, p_Status => p_MJAIPromptRuns_ConfigurationID_Status, p_Cancelled => p_MJAIPromptRuns_ConfigurationID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ConfigurationID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ConfigurationID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ConfigurationID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ConfigurationID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ConfigurationID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ConfigurationID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ConfigurationID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ConfigurationID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ConfigurationID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ConfigurationID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ConfigurationID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_ConfigurationID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ConfigurationID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ConfigurationID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ConfigurationID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIPromptRuns_ConfigurationID_RunName, p_Comments => p_MJAIPromptRuns_ConfigurationID_Comments, p_TestRunID => p_MJAIPromptRuns_ConfigurationID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ConfigurationID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIResultCache_ConfigurationIDID := _rec."ID";
        p_MJAIResultCache_ConfigurationID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_ConfigurationID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_ConfigurationID_RunAt := _rec."RunAt";
        p_MJAIResultCache_ConfigurationID_PromptText := _rec."PromptText";
        p_MJAIResultCache_ConfigurationID_ResultText := _rec."ResultText";
        p_MJAIResultCache_ConfigurationID_Status := _rec."Status";
        p_MJAIResultCache_ConfigurationID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_ConfigurationID_VendorID := _rec."VendorID";
        p_MJAIResultCache_ConfigurationID_AgentID := _rec."AgentID";
        p_MJAIResultCache_ConfigurationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_ConfigurationID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_ConfigurationID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_ID => p_MJAIResultCache_ConfigurationIDID, p_AIPromptID => p_MJAIResultCache_ConfigurationID_AIPromptID, p_AIModelID => p_MJAIResultCache_ConfigurationID_AIModelID, p_RunAt => p_MJAIResultCache_ConfigurationID_RunAt, p_PromptText => p_MJAIResultCache_ConfigurationID_PromptText, p_ResultText => p_MJAIResultCache_ConfigurationID_ResultText, p_Status => p_MJAIResultCache_ConfigurationID_Status, p_ExpiredOn => p_MJAIResultCache_ConfigurationID_ExpiredOn, p_VendorID => p_MJAIResultCache_ConfigurationID_VendorID, p_AgentID => p_MJAIResultCache_ConfigurationID_AgentID, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIResultCache_ConfigurationID_ConfigurationID, p_PromptEmbedding => p_MJAIResultCache_ConfigurationID_PromptEmbedding, p_PromptRunID => p_MJAIResultCache_ConfigurationID_PromptRunID);

    END LOOP;

    

    DELETE FROM
        __mj."AIConfiguration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActions_CreatedByAgentIDID UUID;
    p_MJActions_CreatedByAgentID_CategoryID UUID;
    p_MJActions_CreatedByAgentID_Name VARCHAR(425);
    p_MJActions_CreatedByAgentID_Description TEXT;
    p_MJActions_CreatedByAgentID_Type VARCHAR(20);
    p_MJActions_CreatedByAgentID_UserPrompt TEXT;
    p_MJActions_CreatedByAgentID_UserComments TEXT;
    p_MJActions_CreatedByAgentID_Code TEXT;
    p_MJActions_CreatedByAgentID_CodeComments TEXT;
    p_MJActions_CreatedByAgentID_CodeApprovalStatus VARCHAR(20);
    p_MJActions_CreatedByAgentID_CodeApprovalComments TEXT;
    p_MJActions_CreatedByAgentID_CodeApprovedByUserID UUID;
    p_MJActions_CreatedByAgentID_CodeApprovedAt TIMESTAMPTZ;
    p_MJActions_CreatedByAgentID_CodeLocked BOOLEAN;
    p_MJActions_CreatedByAgentID_ForceCodeGeneration BOOLEAN;
    p_MJActions_CreatedByAgentID_RetentionPeriod INTEGER;
    p_MJActions_CreatedByAgentID_Status VARCHAR(20);
    p_MJActions_CreatedByAgentID_DriverClass VARCHAR(255);
    p_MJActions_CreatedByAgentID_ParentID UUID;
    p_MJActions_CreatedByAgentID_IconClass VARCHAR(100);
    p_MJActions_CreatedByAgentID_DefaultCompactPromptID UUID;
    p_MJActions_CreatedByAgentID_Config TEXT;
    p_MJActions_CreatedByAgentID_RuntimeActionConfiguration TEXT;
    p_MJActions_CreatedByAgentID_MaxExecutionTimeMS INTEGER;
    p_MJActions_CreatedByAgentID_CreatedByAgentID UUID;
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
    p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_AgentID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_AgentID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_AgentID_ImportanceScore NUMERIC(5,2);
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
    p_MJAIAgents_ParentID_DefaultStorageAccountID UUID;
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
-- Cascade update on Action using cursor to call spUpdateAction


    FOR _rec IN SELECT "ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config", "RuntimeActionConfiguration", "MaxExecutionTimeMS", "CreatedByAgentID" FROM __mj."Action" WHERE "CreatedByAgentID" = p_ID
    LOOP
        p_MJActions_CreatedByAgentIDID := _rec."ID";
        p_MJActions_CreatedByAgentID_CategoryID := _rec."CategoryID";
        p_MJActions_CreatedByAgentID_Name := _rec."Name";
        p_MJActions_CreatedByAgentID_Description := _rec."Description";
        p_MJActions_CreatedByAgentID_Type := _rec."Type";
        p_MJActions_CreatedByAgentID_UserPrompt := _rec."UserPrompt";
        p_MJActions_CreatedByAgentID_UserComments := _rec."UserComments";
        p_MJActions_CreatedByAgentID_Code := _rec."Code";
        p_MJActions_CreatedByAgentID_CodeComments := _rec."CodeComments";
        p_MJActions_CreatedByAgentID_CodeApprovalStatus := _rec."CodeApprovalStatus";
        p_MJActions_CreatedByAgentID_CodeApprovalComments := _rec."CodeApprovalComments";
        p_MJActions_CreatedByAgentID_CodeApprovedByUserID := _rec."CodeApprovedByUserID";
        p_MJActions_CreatedByAgentID_CodeApprovedAt := _rec."CodeApprovedAt";
        p_MJActions_CreatedByAgentID_CodeLocked := _rec."CodeLocked";
        p_MJActions_CreatedByAgentID_ForceCodeGeneration := _rec."ForceCodeGeneration";
        p_MJActions_CreatedByAgentID_RetentionPeriod := _rec."RetentionPeriod";
        p_MJActions_CreatedByAgentID_Status := _rec."Status";
        p_MJActions_CreatedByAgentID_DriverClass := _rec."DriverClass";
        p_MJActions_CreatedByAgentID_ParentID := _rec."ParentID";
        p_MJActions_CreatedByAgentID_IconClass := _rec."IconClass";
        p_MJActions_CreatedByAgentID_DefaultCompactPromptID := _rec."DefaultCompactPromptID";
        p_MJActions_CreatedByAgentID_Config := _rec."Config";
        p_MJActions_CreatedByAgentID_RuntimeActionConfiguration := _rec."RuntimeActionConfiguration";
        p_MJActions_CreatedByAgentID_MaxExecutionTimeMS := _rec."MaxExecutionTimeMS";
        p_MJActions_CreatedByAgentID_CreatedByAgentID := _rec."CreatedByAgentID";
        -- Set the FK field to NULL
        p_MJActions_CreatedByAgentID_CreatedByAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAction"(p_ID => p_MJActions_CreatedByAgentIDID, p_CategoryID => p_MJActions_CreatedByAgentID_CategoryID, p_Name => p_MJActions_CreatedByAgentID_Name, p_Description => p_MJActions_CreatedByAgentID_Description, p_Type => p_MJActions_CreatedByAgentID_Type, p_UserPrompt => p_MJActions_CreatedByAgentID_UserPrompt, p_UserComments => p_MJActions_CreatedByAgentID_UserComments, p_Code => p_MJActions_CreatedByAgentID_Code, p_CodeComments => p_MJActions_CreatedByAgentID_CodeComments, p_CodeApprovalStatus => p_MJActions_CreatedByAgentID_CodeApprovalStatus, p_CodeApprovalComments => p_MJActions_CreatedByAgentID_CodeApprovalComments, p_CodeApprovedByUserID => p_MJActions_CreatedByAgentID_CodeApprovedByUserID, p_CodeApprovedAt => p_MJActions_CreatedByAgentID_CodeApprovedAt, p_CodeLocked => p_MJActions_CreatedByAgentID_CodeLocked, p_ForceCodeGeneration => p_MJActions_CreatedByAgentID_ForceCodeGeneration, p_RetentionPeriod => p_MJActions_CreatedByAgentID_RetentionPeriod, p_Status => p_MJActions_CreatedByAgentID_Status, p_DriverClass => p_MJActions_CreatedByAgentID_DriverClass, p_ParentID => p_MJActions_CreatedByAgentID_ParentID, p_IconClass => p_MJActions_CreatedByAgentID_IconClass, p_DefaultCompactPromptID => p_MJActions_CreatedByAgentID_DefaultCompactPromptID, p_Config => p_MJActions_CreatedByAgentID_Config, p_RuntimeActionConfiguration => p_MJActions_CreatedByAgentID_RuntimeActionConfiguration, p_MaxExecutionTimeMS => p_MJActions_CreatedByAgentID_MaxExecutionTimeMS, p_CreatedByAgentID_Clear => 1, p_CreatedByAgentID => p_MJActions_CreatedByAgentID_CreatedByAgentID);

    END LOOP;

    
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
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentActions_AgentID_AgentID, p_ActionID => p_MJAIAgentActions_AgentID_ActionID, p_Status => p_MJAIAgentActions_AgentID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_AgentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_AgentID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_AgentID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_AgentID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_AgentID_CompactMode, p_CompactLength => p_MJAIAgentActions_AgentID_CompactLength, p_CompactPromptID => p_MJAIAgentActions_AgentID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentArtifactType" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentArtifactTypes_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentArtifactType"(p_ID => p_MJAIAgentArtifactTypes_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentClientTool" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentClientTools_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentClientTool"(p_ID => p_MJAIAgentClientTools_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentConfiguration" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentConfigurations_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentConfiguration"(p_ID => p_MJAIAgentConfigurations_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentDataSource" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentDataSources_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentDataSource"(p_ID => p_MJAIAgentDataSources_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentExample" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentExamples_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentExample"(p_ID => p_MJAIAgentExamples_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentLearningCycle" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentLearningCycles_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentLearningCycle"(p_ID => p_MJAIAgentLearningCycles_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentModality" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentModalities_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentModality"(p_ID => p_MJAIAgentModalities_AgentIDID);
        
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
        PERFORM __mj."spUpdateAIAgentModel"(p_ID => p_MJAIAgentModels_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentModels_AgentID_AgentID, p_ModelID => p_MJAIAgentModels_AgentID_ModelID, p_Active => p_MJAIAgentModels_AgentID_Active, p_Priority => p_MJAIAgentModels_AgentID_Priority);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore" FROM __mj."AIAgentNote" WHERE "AgentID" = p_ID
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
        p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_AgentID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_AgentID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_AgentID_ImportanceScore := _rec."ImportanceScore";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentNotes_AgentID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_AgentID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_AgentID_Note, p_UserID => p_MJAIAgentNotes_AgentID_UserID, p_Type => p_MJAIAgentNotes_AgentID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_AgentID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_AgentID_Comments, p_Status => p_MJAIAgentNotes_AgentID_Status, p_SourceConversationID => p_MJAIAgentNotes_AgentID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_AgentID_SourceConversationDetailID, p_SourceAIAgentRunID => p_MJAIAgentNotes_AgentID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_AgentID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_AgentID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_AgentID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_AgentID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_AgentID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_AgentID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_AgentID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_AgentID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_AgentID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_AgentID_ImportanceScore);

    END LOOP;

    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPermission" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPermissions_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPermission"(p_ID => p_MJAIAgentPermissions_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPrompts_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_ID => p_MJAIAgentRelationships_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_SubAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_ID => p_MJAIAgentRelationships_SubAgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRequest" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRequests_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRequest"(p_ID => p_MJAIAgentRequests_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRun" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRuns_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRun"(p_ID => p_MJAIAgentRuns_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentStep" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSteps_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentStep"(p_ID => p_MJAIAgentSteps_AgentIDID);
        
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
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_SubAgentIDID, p_AgentID => p_MJAIAgentSteps_SubAgentID_AgentID, p_Name => p_MJAIAgentSteps_SubAgentID_Name, p_Description => p_MJAIAgentSteps_SubAgentID_Description, p_StepType => p_MJAIAgentSteps_SubAgentID_StepType, p_StartingStep => p_MJAIAgentSteps_SubAgentID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_SubAgentID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_SubAgentID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_SubAgentID_OnErrorBehavior, p_ActionID => p_MJAIAgentSteps_SubAgentID_ActionID, p_SubAgentID_Clear => 1, p_SubAgentID => p_MJAIAgentSteps_SubAgentID_SubAgentID, p_PromptID => p_MJAIAgentSteps_SubAgentID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_SubAgentID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_SubAgentID_PositionX, p_PositionY => p_MJAIAgentSteps_SubAgentID_PositionY, p_Width => p_MJAIAgentSteps_SubAgentID_Width, p_Height => p_MJAIAgentSteps_SubAgentID_Height, p_Status => p_MJAIAgentSteps_SubAgentID_Status, p_ActionInputMapping => p_MJAIAgentSteps_SubAgentID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_SubAgentID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_SubAgentID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
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
        p_MJAIAgents_ParentID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ParentIDID, p_Name => p_MJAIAgents_ParentID_Name, p_Description => p_MJAIAgents_ParentID_Description, p_LogoURL => p_MJAIAgents_ParentID_LogoURL, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgents_ParentID_ParentID, p_ExposeAsAction => p_MJAIAgents_ParentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ParentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ParentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ParentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_ContextCompressionPromptID => p_MJAIAgents_ParentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_TypeID => p_MJAIAgents_ParentID_TypeID, p_Status => p_MJAIAgents_ParentID_Status, p_DriverClass => p_MJAIAgents_ParentID_DriverClass, p_IconClass => p_MJAIAgents_ParentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ParentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ParentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ParentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_ParentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ParentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ParentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ParentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_ParentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ParentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ParentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ParentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ParentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ParentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ParentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ParentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ParentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ParentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ParentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_ParentID_IsRestricted, p_MessageMode => p_MJAIAgents_ParentID_MessageMode, p_MaxMessages => p_MJAIAgents_ParentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_ParentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_ParentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ParentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ParentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ParentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ParentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ParentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ParentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ParentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_ParentID_DefaultStorageAccountID);

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
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentIDID, p_PromptID => p_MJAIPromptRuns_AgentID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIPromptRuns_AgentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentID_Messages, p_Result => p_MJAIPromptRuns_AgentID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentID_TotalCost, p_Success => p_MJAIPromptRuns_AgentID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentID_ParentID, p_RunType => p_MJAIPromptRuns_AgentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_AgentID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentID_Temperature, p_TopP => p_MJAIPromptRuns_AgentID_TopP, p_TopK => p_MJAIPromptRuns_AgentID_TopK, p_MinP => p_MJAIPromptRuns_AgentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentID_Status, p_Cancelled => p_MJAIPromptRuns_AgentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentID_RunName, p_Comments => p_MJAIPromptRuns_AgentID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentID_AssistantPrefill);

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
        PERFORM __mj."spUpdateAIResultCache"(p_ID => p_MJAIResultCache_AgentIDID, p_AIPromptID => p_MJAIResultCache_AgentID_AIPromptID, p_AIModelID => p_MJAIResultCache_AgentID_AIModelID, p_RunAt => p_MJAIResultCache_AgentID_RunAt, p_PromptText => p_MJAIResultCache_AgentID_PromptText, p_ResultText => p_MJAIResultCache_AgentID_ResultText, p_Status => p_MJAIResultCache_AgentID_Status, p_ExpiredOn => p_MJAIResultCache_AgentID_ExpiredOn, p_VendorID => p_MJAIResultCache_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIResultCache_AgentID_AgentID, p_ConfigurationID => p_MJAIResultCache_AgentID_ConfigurationID, p_PromptEmbedding => p_MJAIResultCache_AgentID_PromptEmbedding, p_PromptRunID => p_MJAIResultCache_AgentID_PromptRunID);

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
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_AgentIDID, p_ConversationID => p_MJConversationDetails_AgentID_ConversationID, p_ExternalID => p_MJConversationDetails_AgentID_ExternalID, p_Role => p_MJConversationDetails_AgentID_Role, p_Message => p_MJConversationDetails_AgentID_Message, p_Error => p_MJConversationDetails_AgentID_Error, p_HiddenToUser => p_MJConversationDetails_AgentID_HiddenToUser, p_UserRating => p_MJConversationDetails_AgentID_UserRating, p_UserFeedback => p_MJConversationDetails_AgentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_AgentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_AgentID_UserID, p_ArtifactID => p_MJConversationDetails_AgentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_AgentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_AgentID_CompletionTime, p_IsPinned => p_MJConversationDetails_AgentID_IsPinned, p_ParentID => p_MJConversationDetails_AgentID_ParentID, p_AgentID_Clear => 1, p_AgentID => p_MJConversationDetails_AgentID_AgentID, p_Status => p_MJConversationDetails_AgentID_Status, p_SuggestedResponses => p_MJConversationDetails_AgentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_AgentID_TestRunID, p_ResponseForm => p_MJConversationDetails_AgentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_AgentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_AgentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_AgentID_OriginalMessageChanged);

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
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_AgentIDID, p_ParentID => p_MJTasks_AgentID_ParentID, p_Name => p_MJTasks_AgentID_Name, p_Description => p_MJTasks_AgentID_Description, p_TypeID => p_MJTasks_AgentID_TypeID, p_EnvironmentID => p_MJTasks_AgentID_EnvironmentID, p_ProjectID => p_MJTasks_AgentID_ProjectID, p_ConversationDetailID => p_MJTasks_AgentID_ConversationDetailID, p_UserID => p_MJTasks_AgentID_UserID, p_AgentID_Clear => 1, p_AgentID => p_MJTasks_AgentID_AgentID, p_Status => p_MJTasks_AgentID_Status, p_PercentComplete => p_MJTasks_AgentID_PercentComplete, p_DueAt => p_MJTasks_AgentID_DueAt, p_StartedAt => p_MJTasks_AgentID_StartedAt, p_CompletedAt => p_MJTasks_AgentID_CompletedAt);

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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelArchitecture'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelArchitecture"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelArchitecture"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAICredentialBinding'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAICredentialBinding"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AICredentialBinding"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelCost'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelCost"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelCost"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelAction"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModality'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModality"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModality"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelPriceType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelPriceType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelPriceType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelPriceUnitType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelPriceUnitType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelPriceUnitType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelVendor'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelModality'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelModality"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelModality"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModelType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIModel'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPromptRunMedia'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRunMedia"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIPromptRunMedia"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPromptCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIPromptCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPromptModel'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptModel"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIPromptModel"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPromptRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIPromptRunMedias_PromptRunIDID UUID;
    p_MJAIPromptRuns_ParentIDID UUID;
    p_MJAIPromptRuns_ParentID_PromptID UUID;
    p_MJAIPromptRuns_ParentID_ModelID UUID;
    p_MJAIPromptRuns_ParentID_VendorID UUID;
    p_MJAIPromptRuns_ParentID_AgentID UUID;
    p_MJAIPromptRuns_ParentID_ConfigurationID UUID;
    p_MJAIPromptRuns_ParentID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ParentID_Messages TEXT;
    p_MJAIPromptRuns_ParentID_Result TEXT;
    p_MJAIPromptRuns_ParentID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ParentID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ParentID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ParentID_Success BOOLEAN;
    p_MJAIPromptRuns_ParentID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ParentID_ParentID UUID;
    p_MJAIPromptRuns_ParentID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ParentID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ParentID_AgentRunID UUID;
    p_MJAIPromptRuns_ParentID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ParentID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ParentID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ParentID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ParentID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_TopK INTEGER;
    p_MJAIPromptRuns_ParentID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_Seed INTEGER;
    p_MJAIPromptRuns_ParentID_StopSequences TEXT;
    p_MJAIPromptRuns_ParentID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ParentID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ParentID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ParentID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ParentID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ParentID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ParentID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ParentID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ParentID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ParentID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ParentID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ParentID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ParentID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ParentID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ParentID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ParentID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ParentID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ParentID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ParentID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ParentID_OriginalModelID UUID;
    p_MJAIPromptRuns_ParentID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ParentID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ParentID_ModelSelection TEXT;
    p_MJAIPromptRuns_ParentID_Status VARCHAR(50);
    p_MJAIPromptRuns_ParentID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ParentID_CancellationReason TEXT;
    p_MJAIPromptRuns_ParentID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ParentID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ParentID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ParentID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ParentID_JudgeID UUID;
    p_MJAIPromptRuns_ParentID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ParentID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ParentID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ParentID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ParentID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ParentID_ChildPromptID UUID;
    p_MJAIPromptRuns_ParentID_QueueTime INTEGER;
    p_MJAIPromptRuns_ParentID_PromptTime INTEGER;
    p_MJAIPromptRuns_ParentID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ParentID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ParentID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ParentID_Comments TEXT;
    p_MJAIPromptRuns_ParentID_TestRunID UUID;
    p_MJAIPromptRuns_ParentID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunIDID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_PromptID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_VendorID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_AgentID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_Messages TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_Result TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_RerunFromPromptRunID_Success BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ParentID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunType VARCHAR(20);
    p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_TopK INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_Seed INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_Status VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunName VARCHAR(255);
    p_MJAIPromptRuns_RerunFromPromptRunID_Comments TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill TEXT;
    p_MJAIResultCache_PromptRunIDID UUID;
    p_MJAIResultCache_PromptRunID_AIPromptID UUID;
    p_MJAIResultCache_PromptRunID_AIModelID UUID;
    p_MJAIResultCache_PromptRunID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_PromptRunID_PromptText TEXT;
    p_MJAIResultCache_PromptRunID_ResultText TEXT;
    p_MJAIResultCache_PromptRunID_Status VARCHAR(50);
    p_MJAIResultCache_PromptRunID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_PromptRunID_VendorID UUID;
    p_MJAIResultCache_PromptRunID_AgentID UUID;
    p_MJAIResultCache_PromptRunID_ConfigurationID UUID;
    p_MJAIResultCache_PromptRunID_PromptEmbedding BYTEA;
    p_MJAIResultCache_PromptRunID_PromptRunID UUID;
    p_MJContentProcessRunPromptRuns_AIPromptRunIDID UUID;
BEGIN
-- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRunMedia" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJAIPromptRunMedias_PromptRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRunMedia"(p_ID => p_MJAIPromptRunMedias_PromptRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIPromptRuns_ParentIDID := _rec."ID";
        p_MJAIPromptRuns_ParentID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ParentID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ParentID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ParentID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ParentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ParentID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ParentID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ParentID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ParentID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ParentID_Result := _rec."Result";
        p_MJAIPromptRuns_ParentID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ParentID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ParentID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ParentID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ParentID_Success := _rec."Success";
        p_MJAIPromptRuns_ParentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ParentID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ParentID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ParentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ParentID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ParentID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ParentID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ParentID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ParentID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ParentID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ParentID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ParentID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ParentID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ParentID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ParentID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ParentID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ParentID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ParentID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ParentID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ParentID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ParentID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ParentID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ParentID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ParentID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ParentID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ParentID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ParentID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ParentID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ParentID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ParentID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ParentID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ParentID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ParentID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ParentID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ParentID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ParentID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ParentID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ParentID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ParentID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ParentID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ParentID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ParentID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ParentID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ParentID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ParentID_Status := _rec."Status";
        p_MJAIPromptRuns_ParentID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ParentID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ParentID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ParentID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ParentID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ParentID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ParentID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ParentID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ParentID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ParentID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ParentID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ParentID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ParentID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ParentID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ParentID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ParentID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ParentID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ParentID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ParentID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ParentID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_ParentID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ParentIDID, p_PromptID => p_MJAIPromptRuns_ParentID_PromptID, p_ModelID => p_MJAIPromptRuns_ParentID_ModelID, p_VendorID => p_MJAIPromptRuns_ParentID_VendorID, p_AgentID => p_MJAIPromptRuns_ParentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ParentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ParentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ParentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ParentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ParentID_Messages, p_Result => p_MJAIPromptRuns_ParentID_Result, p_TokensUsed => p_MJAIPromptRuns_ParentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ParentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ParentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ParentID_TotalCost, p_Success => p_MJAIPromptRuns_ParentID_Success, p_ErrorMessage => p_MJAIPromptRuns_ParentID_ErrorMessage, p_ParentID_Clear => 1, p_ParentID => p_MJAIPromptRuns_ParentID_ParentID, p_RunType => p_MJAIPromptRuns_ParentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ParentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ParentID_AgentRunID, p_Cost => p_MJAIPromptRuns_ParentID_Cost, p_CostCurrency => p_MJAIPromptRuns_ParentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ParentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ParentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ParentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ParentID_Temperature, p_TopP => p_MJAIPromptRuns_ParentID_TopP, p_TopK => p_MJAIPromptRuns_ParentID_TopK, p_MinP => p_MJAIPromptRuns_ParentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ParentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ParentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ParentID_Seed, p_StopSequences => p_MJAIPromptRuns_ParentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ParentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ParentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ParentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ParentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ParentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ParentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ParentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ParentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ParentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ParentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ParentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ParentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ParentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ParentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ParentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ParentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ParentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ParentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ParentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ParentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ParentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ParentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ParentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ParentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ParentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ParentID_ModelSelection, p_Status => p_MJAIPromptRuns_ParentID_Status, p_Cancelled => p_MJAIPromptRuns_ParentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ParentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ParentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ParentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ParentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ParentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ParentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ParentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ParentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ParentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ParentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ParentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_ParentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ParentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ParentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ParentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ParentID_EffortLevel, p_RunName => p_MJAIPromptRuns_ParentID_RunName, p_Comments => p_MJAIPromptRuns_ParentID_Comments, p_TestRunID => p_MJAIPromptRuns_ParentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ParentID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill" FROM __mj."AIPromptRun" WHERE "RerunFromPromptRunID" = p_ID
    LOOP
        p_MJAIPromptRuns_RerunFromPromptRunIDID := _rec."ID";
        p_MJAIPromptRuns_RerunFromPromptRunID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_RerunFromPromptRunID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_RerunFromPromptRunID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_RerunFromPromptRunID_Messages := _rec."Messages";
        p_MJAIPromptRuns_RerunFromPromptRunID_Result := _rec."Result";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_RerunFromPromptRunID_Success := _rec."Success";
        p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_RerunFromPromptRunID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunType := _rec."RunType";
        p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_Cost := _rec."Cost";
        p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopP := _rec."TopP";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopK := _rec."TopK";
        p_MJAIPromptRuns_RerunFromPromptRunID_MinP := _rec."MinP";
        p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_RerunFromPromptRunID_Seed := _rec."Seed";
        p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_RerunFromPromptRunID_Status := _rec."Status";
        p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunName := _rec."RunName";
        p_MJAIPromptRuns_RerunFromPromptRunID_Comments := _rec."Comments";
        p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill := _rec."AssistantPrefill";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_RerunFromPromptRunIDID, p_PromptID => p_MJAIPromptRuns_RerunFromPromptRunID_PromptID, p_ModelID => p_MJAIPromptRuns_RerunFromPromptRunID_ModelID, p_VendorID => p_MJAIPromptRuns_RerunFromPromptRunID_VendorID, p_AgentID => p_MJAIPromptRuns_RerunFromPromptRunID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_RerunFromPromptRunID_RunAt, p_CompletedAt => p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_RerunFromPromptRunID_Messages, p_Result => p_MJAIPromptRuns_RerunFromPromptRunID_Result, p_TokensUsed => p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost, p_Success => p_MJAIPromptRuns_RerunFromPromptRunID_Success, p_ErrorMessage => p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_RerunFromPromptRunID_ParentID, p_RunType => p_MJAIPromptRuns_RerunFromPromptRunID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, p_Cost => p_MJAIPromptRuns_RerunFromPromptRunID_Cost, p_CostCurrency => p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_RerunFromPromptRunID_Temperature, p_TopP => p_MJAIPromptRuns_RerunFromPromptRunID_TopP, p_TopK => p_MJAIPromptRuns_RerunFromPromptRunID_TopK, p_MinP => p_MJAIPromptRuns_RerunFromPromptRunID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, p_Seed => p_MJAIPromptRuns_RerunFromPromptRunID_Seed, p_StopSequences => p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, p_RerunFromPromptRunID_Clear => 1, p_RerunFromPromptRunID => p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, p_Status => p_MJAIPromptRuns_RerunFromPromptRunID_Status, p_Cancelled => p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit, p_CacheKey => p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey, p_JudgeID => p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime, p_PromptTime => p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c, p_EffortLevel => p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, p_RunName => p_MJAIPromptRuns_RerunFromPromptRunID_RunName, p_Comments => p_MJAIPromptRuns_RerunFromPromptRunID_Comments, p_TestRunID => p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJAIResultCache_PromptRunIDID := _rec."ID";
        p_MJAIResultCache_PromptRunID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_PromptRunID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_PromptRunID_RunAt := _rec."RunAt";
        p_MJAIResultCache_PromptRunID_PromptText := _rec."PromptText";
        p_MJAIResultCache_PromptRunID_ResultText := _rec."ResultText";
        p_MJAIResultCache_PromptRunID_Status := _rec."Status";
        p_MJAIResultCache_PromptRunID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_PromptRunID_VendorID := _rec."VendorID";
        p_MJAIResultCache_PromptRunID_AgentID := _rec."AgentID";
        p_MJAIResultCache_PromptRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_PromptRunID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_PromptRunID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_PromptRunID_PromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_ID => p_MJAIResultCache_PromptRunIDID, p_AIPromptID => p_MJAIResultCache_PromptRunID_AIPromptID, p_AIModelID => p_MJAIResultCache_PromptRunID_AIModelID, p_RunAt => p_MJAIResultCache_PromptRunID_RunAt, p_PromptText => p_MJAIResultCache_PromptRunID_PromptText, p_ResultText => p_MJAIResultCache_PromptRunID_ResultText, p_Status => p_MJAIResultCache_PromptRunID_Status, p_ExpiredOn => p_MJAIResultCache_PromptRunID_ExpiredOn, p_VendorID => p_MJAIResultCache_PromptRunID_VendorID, p_AgentID => p_MJAIResultCache_PromptRunID_AgentID, p_ConfigurationID => p_MJAIResultCache_PromptRunID_ConfigurationID, p_PromptEmbedding => p_MJAIResultCache_PromptRunID_PromptEmbedding, p_PromptRunID_Clear => 1, p_PromptRunID => p_MJAIResultCache_PromptRunID_PromptRunID);

    END LOOP;

    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun

    FOR _rec IN SELECT "ID" FROM __mj."ContentProcessRunPromptRun" WHERE "AIPromptRunID" = p_ID
    LOOP
        p_MJContentProcessRunPromptRuns_AIPromptRunIDID := _rec."ID";
        PERFORM __mj."spDeleteContentProcessRunPromptRun"(p_ID => p_MJContentProcessRunPromptRuns_AIPromptRunIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."AIPromptRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPromptType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIPromptType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIVendorTypeDefinition'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIVendorTypeDefinition"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIVendorTypeDefinition"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIVendorType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIVendorType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIVendorType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIResultCache'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIResultCache"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIResultCache"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPrompt'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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
    p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration TEXT;
    p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS INTEGER;
    p_MJActions_DefaultCompactPromptID_CreatedByAgentID UUID;
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
    p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID UUID;
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
    p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID UUID;
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


    FOR _rec IN SELECT "ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config", "RuntimeActionConfiguration", "MaxExecutionTimeMS", "CreatedByAgentID" FROM __mj."Action" WHERE "DefaultCompactPromptID" = p_ID
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
        p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration := _rec."RuntimeActionConfiguration";
        p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS := _rec."MaxExecutionTimeMS";
        p_MJActions_DefaultCompactPromptID_CreatedByAgentID := _rec."CreatedByAgentID";
        -- Set the FK field to NULL
        p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAction"(p_ID => p_MJActions_DefaultCompactPromptIDID, p_CategoryID => p_MJActions_DefaultCompactPromptID_CategoryID, p_Name => p_MJActions_DefaultCompactPromptID_Name, p_Description => p_MJActions_DefaultCompactPromptID_Description, p_Type => p_MJActions_DefaultCompactPromptID_Type, p_UserPrompt => p_MJActions_DefaultCompactPromptID_UserPrompt, p_UserComments => p_MJActions_DefaultCompactPromptID_UserComments, p_Code => p_MJActions_DefaultCompactPromptID_Code, p_CodeComments => p_MJActions_DefaultCompactPromptID_CodeComments, p_CodeApprovalStatus => p_MJActions_DefaultCompactPromptID_CodeApprovalStatus, p_CodeApprovalComments => p_MJActions_DefaultCompactPromptID_CodeApprovalComments, p_CodeApprovedByUserID => p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID, p_CodeApprovedAt => p_MJActions_DefaultCompactPromptID_CodeApprovedAt, p_CodeLocked => p_MJActions_DefaultCompactPromptID_CodeLocked, p_ForceCodeGeneration => p_MJActions_DefaultCompactPromptID_ForceCodeGeneration, p_RetentionPeriod => p_MJActions_DefaultCompactPromptID_RetentionPeriod, p_Status => p_MJActions_DefaultCompactPromptID_Status, p_DriverClass => p_MJActions_DefaultCompactPromptID_DriverClass, p_ParentID => p_MJActions_DefaultCompactPromptID_ParentID, p_IconClass => p_MJActions_DefaultCompactPromptID_IconClass, p_DefaultCompactPromptID_Clear => 1, p_DefaultCompactPromptID => p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID, p_Config => p_MJActions_DefaultCompactPromptID_Config, p_RuntimeActionConfiguration => p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, p_MaxExecutionTimeMS => p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, p_CreatedByAgentID => p_MJActions_DefaultCompactPromptID_CreatedByAgentID);

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
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_CompactPromptIDID, p_AgentID => p_MJAIAgentActions_CompactPromptID_AgentID, p_ActionID => p_MJAIAgentActions_CompactPromptID_ActionID, p_Status => p_MJAIAgentActions_CompactPromptID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_CompactPromptID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_CompactPromptID_CompactMode, p_CompactLength => p_MJAIAgentActions_CompactPromptID_CompactLength, p_CompactPromptID_Clear => 1, p_CompactPromptID => p_MJAIAgentActions_CompactPromptID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIAgentPrompts_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_PromptIDID);
        
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
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_PromptIDID, p_AgentID => p_MJAIAgentSteps_PromptID_AgentID, p_Name => p_MJAIAgentSteps_PromptID_Name, p_Description => p_MJAIAgentSteps_PromptID_Description, p_StepType => p_MJAIAgentSteps_PromptID_StepType, p_StartingStep => p_MJAIAgentSteps_PromptID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_PromptID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_PromptID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_PromptID_OnErrorBehavior, p_ActionID => p_MJAIAgentSteps_PromptID_ActionID, p_SubAgentID => p_MJAIAgentSteps_PromptID_SubAgentID, p_PromptID_Clear => 1, p_PromptID => p_MJAIAgentSteps_PromptID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_PromptID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_PromptID_PositionX, p_PositionY => p_MJAIAgentSteps_PromptID_PositionY, p_Width => p_MJAIAgentSteps_PromptID_Width, p_Height => p_MJAIAgentSteps_PromptID_Height, p_Status => p_MJAIAgentSteps_PromptID_Status, p_ActionInputMapping => p_MJAIAgentSteps_PromptID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_PromptID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_PromptID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy", "DefaultStorageAccountID" FROM __mj."AIAgentType" WHERE "SystemPromptID" = p_ID
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
        p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        -- Set the FK field to NULL
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_ID => p_MJAIAgentTypes_SystemPromptIDID, p_Name => p_MJAIAgentTypes_SystemPromptID_Name, p_Description => p_MJAIAgentTypes_SystemPromptID_Description, p_SystemPromptID_Clear => 1, p_SystemPromptID => p_MJAIAgentTypes_SystemPromptID_SystemPromptID, p_IsActive => p_MJAIAgentTypes_SystemPromptID_IsActive, p_AgentPromptPlaceholder => p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, p_DriverClass => p_MJAIAgentTypes_SystemPromptID_DriverClass, p_UIFormSectionKey => p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey, p_UIFormKey => p_MJAIAgentTypes_SystemPromptID_UIFormKey, p_UIFormSectionExpandedByDefault => p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, p_PromptParamsSchema => p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema, p_AssignmentStrategy => p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy, p_DefaultStorageAccountID => p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID" FROM __mj."AIAgent" WHERE "ContextCompressionPromptID" = p_ID
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
        p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        -- Set the FK field to NULL
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ContextCompressionPromptIDID, p_Name => p_MJAIAgents_ContextCompressionPromptID_Name, p_Description => p_MJAIAgents_ContextCompressionPromptID_Description, p_LogoURL => p_MJAIAgents_ContextCompressionPromptID_LogoURL, p_ParentID => p_MJAIAgents_ContextCompressionPromptID_ParentID, p_ExposeAsAction => p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ContextCompressionPromptID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508, p_ContextCompressionMessageThreshold => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d, p_ContextCompressionPromptID_Clear => 1, p_ContextCompressionPromptID => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1, p_TypeID => p_MJAIAgents_ContextCompressionPromptID_TypeID, p_Status => p_MJAIAgents_ContextCompressionPromptID_Status, p_DriverClass => p_MJAIAgents_ContextCompressionPromptID_DriverClass, p_IconClass => p_MJAIAgents_ContextCompressionPromptID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ContextCompressionPromptID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251, p_MaxCostPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60, p_StartingPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode, p_DefaultPromptEffortLevel => p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203, p_ChatHandlingOption => p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ContextCompressionPromptID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ContextCompressionPromptID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ContextCompressionPromptID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ContextCompressionPromptID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212, p_IsRestricted => p_MJAIAgents_ContextCompressionPromptID_IsRestricted, p_MessageMode => p_MJAIAgents_ContextCompressionPromptID_MessageMode, p_MaxMessages => p_MJAIAgents_ContextCompressionPromptID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf, p_AttachmentRootPath => p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef, p_AgentTypePromptParams => p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ContextCompressionPromptID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ContextCompressionPromptID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b, p_DefaultStorageAccountID => p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID);

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
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_DefaultPromptForContextCompressionIDID, p_Name => p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name, p_Description => p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038, p_IsDefault => p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7, p_Status => p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408, p_DefaultPromptForContextCompressionID_Clear => 1, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d, p_DefaultStorageProviderID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a, p_DefaultStorageRootPath => p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed, p_ParentID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4);

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
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID, p_Name => p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467, p_Description => p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29, p_IsDefault => p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6, p_Status => p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a, p_DefaultPromptForContextSummarizationID_Clear => 1, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_DefaultPromptForContextSummarization_931872, p_DefaultStorageProviderID => p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80, p_DefaultStorageRootPath => p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c, p_ParentID => p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84);

    END LOOP;

    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptModel" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptModels_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptModel"(p_ID => p_MJAIPromptModels_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRun" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptRuns_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRun"(p_ID => p_MJAIPromptRuns_PromptIDID);
        
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
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_JudgeIDID, p_PromptID => p_MJAIPromptRuns_JudgeID_PromptID, p_ModelID => p_MJAIPromptRuns_JudgeID_ModelID, p_VendorID => p_MJAIPromptRuns_JudgeID_VendorID, p_AgentID => p_MJAIPromptRuns_JudgeID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_JudgeID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_JudgeID_RunAt, p_CompletedAt => p_MJAIPromptRuns_JudgeID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_JudgeID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_JudgeID_Messages, p_Result => p_MJAIPromptRuns_JudgeID_Result, p_TokensUsed => p_MJAIPromptRuns_JudgeID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_JudgeID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_JudgeID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_JudgeID_TotalCost, p_Success => p_MJAIPromptRuns_JudgeID_Success, p_ErrorMessage => p_MJAIPromptRuns_JudgeID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_JudgeID_ParentID, p_RunType => p_MJAIPromptRuns_JudgeID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_JudgeID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_JudgeID_AgentRunID, p_Cost => p_MJAIPromptRuns_JudgeID_Cost, p_CostCurrency => p_MJAIPromptRuns_JudgeID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_JudgeID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_JudgeID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_JudgeID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_JudgeID_Temperature, p_TopP => p_MJAIPromptRuns_JudgeID_TopP, p_TopK => p_MJAIPromptRuns_JudgeID_TopK, p_MinP => p_MJAIPromptRuns_JudgeID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_JudgeID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_JudgeID_PresencePenalty, p_Seed => p_MJAIPromptRuns_JudgeID_Seed, p_StopSequences => p_MJAIPromptRuns_JudgeID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_JudgeID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_JudgeID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_JudgeID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_JudgeID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_JudgeID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_JudgeID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_JudgeID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_JudgeID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_JudgeID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_JudgeID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_JudgeID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_JudgeID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_JudgeID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_JudgeID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_JudgeID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_JudgeID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_JudgeID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_JudgeID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_JudgeID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_JudgeID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_JudgeID_ModelSelection, p_Status => p_MJAIPromptRuns_JudgeID_Status, p_Cancelled => p_MJAIPromptRuns_JudgeID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_JudgeID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_JudgeID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_JudgeID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_JudgeID_CacheHit, p_CacheKey => p_MJAIPromptRuns_JudgeID_CacheKey, p_JudgeID_Clear => 1, p_JudgeID => p_MJAIPromptRuns_JudgeID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_JudgeID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_JudgeID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_JudgeID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_JudgeID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_JudgeID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_JudgeID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_JudgeID_QueueTime, p_PromptTime => p_MJAIPromptRuns_JudgeID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_JudgeID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_JudgeID_EffortLevel, p_RunName => p_MJAIPromptRuns_JudgeID_RunName, p_Comments => p_MJAIPromptRuns_JudgeID_Comments, p_TestRunID => p_MJAIPromptRuns_JudgeID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_JudgeID_AssistantPrefill);

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
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ChildPromptIDID, p_PromptID => p_MJAIPromptRuns_ChildPromptID_PromptID, p_ModelID => p_MJAIPromptRuns_ChildPromptID_ModelID, p_VendorID => p_MJAIPromptRuns_ChildPromptID_VendorID, p_AgentID => p_MJAIPromptRuns_ChildPromptID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ChildPromptID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ChildPromptID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ChildPromptID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ChildPromptID_Messages, p_Result => p_MJAIPromptRuns_ChildPromptID_Result, p_TokensUsed => p_MJAIPromptRuns_ChildPromptID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ChildPromptID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ChildPromptID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ChildPromptID_TotalCost, p_Success => p_MJAIPromptRuns_ChildPromptID_Success, p_ErrorMessage => p_MJAIPromptRuns_ChildPromptID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ChildPromptID_ParentID, p_RunType => p_MJAIPromptRuns_ChildPromptID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ChildPromptID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ChildPromptID_AgentRunID, p_Cost => p_MJAIPromptRuns_ChildPromptID_Cost, p_CostCurrency => p_MJAIPromptRuns_ChildPromptID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ChildPromptID_Temperature, p_TopP => p_MJAIPromptRuns_ChildPromptID_TopP, p_TopK => p_MJAIPromptRuns_ChildPromptID_TopK, p_MinP => p_MJAIPromptRuns_ChildPromptID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ChildPromptID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ChildPromptID_Seed, p_StopSequences => p_MJAIPromptRuns_ChildPromptID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ChildPromptID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ChildPromptID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ChildPromptID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ChildPromptID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ChildPromptID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ChildPromptID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ChildPromptID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ChildPromptID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ChildPromptID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ChildPromptID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ChildPromptID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ChildPromptID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ChildPromptID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ChildPromptID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ChildPromptID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ChildPromptID_ModelSelection, p_Status => p_MJAIPromptRuns_ChildPromptID_Status, p_Cancelled => p_MJAIPromptRuns_ChildPromptID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ChildPromptID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ChildPromptID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ChildPromptID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ChildPromptID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ChildPromptID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ChildPromptID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ChildPromptID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ChildPromptID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ChildPromptID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ChildPromptID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ChildPromptID_ErrorDetails, p_ChildPromptID_Clear => 1, p_ChildPromptID => p_MJAIPromptRuns_ChildPromptID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ChildPromptID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ChildPromptID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ChildPromptID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ChildPromptID_EffortLevel, p_RunName => p_MJAIPromptRuns_ChildPromptID_RunName, p_Comments => p_MJAIPromptRuns_ChildPromptID_Comments, p_TestRunID => p_MJAIPromptRuns_ChildPromptID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ChildPromptID_AssistantPrefill);

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
        PERFORM __mj."spUpdateAIPrompt"(p_ID => p_MJAIPrompts_ResultSelectorPromptIDID, p_Name => p_MJAIPrompts_ResultSelectorPromptID_Name, p_Description => p_MJAIPrompts_ResultSelectorPromptID_Description, p_TemplateID => p_MJAIPrompts_ResultSelectorPromptID_TemplateID, p_CategoryID => p_MJAIPrompts_ResultSelectorPromptID_CategoryID, p_TypeID => p_MJAIPrompts_ResultSelectorPromptID_TypeID, p_Status => p_MJAIPrompts_ResultSelectorPromptID_Status, p_ResponseFormat => p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat, p_ModelSpecificResponseFormat => p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd, p_AIModelTypeID => p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, p_MinPowerRank => p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank, p_SelectionStrategy => p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, p_PowerPreference => p_MJAIPrompts_ResultSelectorPromptID_PowerPreference, p_ParallelizationMode => p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, p_ParallelCount => p_MJAIPrompts_ResultSelectorPromptID_ParallelCount, p_ParallelConfigParam => p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, p_OutputType => p_MJAIPrompts_ResultSelectorPromptID_OutputType, p_OutputExample => p_MJAIPrompts_ResultSelectorPromptID_OutputExample, p_ValidationBehavior => p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, p_MaxRetries => p_MJAIPrompts_ResultSelectorPromptID_MaxRetries, p_RetryDelayMS => p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, p_RetryStrategy => p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy, p_ResultSelectorPromptID_Clear => 1, p_ResultSelectorPromptID => p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, p_EnableCaching => p_MJAIPrompts_ResultSelectorPromptID_EnableCaching, p_CacheTTLSeconds => p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, p_CacheMatchType => p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType, p_CacheSimilarityThreshold => p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, p_CacheMustMatchModel => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, p_CacheMustMatchVendor => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, p_CacheMustMatchAgent => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, p_CacheMustMatchConfig => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, p_PromptRole => p_MJAIPrompts_ResultSelectorPromptID_PromptRole, p_PromptPosition => p_MJAIPrompts_ResultSelectorPromptID_PromptPosition, p_Temperature => p_MJAIPrompts_ResultSelectorPromptID_Temperature, p_TopP => p_MJAIPrompts_ResultSelectorPromptID_TopP, p_TopK => p_MJAIPrompts_ResultSelectorPromptID_TopK, p_MinP => p_MJAIPrompts_ResultSelectorPromptID_MinP, p_FrequencyPenalty => p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty, p_Seed => p_MJAIPrompts_ResultSelectorPromptID_Seed, p_StopSequences => p_MJAIPrompts_ResultSelectorPromptID_StopSequences, p_IncludeLogProbs => p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, p_TopLogProbs => p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs, p_FailoverStrategy => p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, p_FailoverMaxAttempts => p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, p_FailoverDelaySeconds => p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, p_FailoverModelStrategy => p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, p_FailoverErrorScope => p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, p_EffortLevel => p_MJAIPrompts_ResultSelectorPromptID_EffortLevel, p_AssistantPrefill => p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, p_PrefillFallbackMode => p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, p_RequireSpecificModels => p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels);

    END LOOP;

    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache

    FOR _rec IN SELECT "ID" FROM __mj."AIResultCache" WHERE "AIPromptID" = p_ID
    LOOP
        p_MJAIResultCache_AIPromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIResultCache"(p_ID => p_MJAIResultCache_AIPromptIDID);
        
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIKeyApplication'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKeyApplication"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIKeyApplication"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIApplication'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIApplication"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIApplication"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIVendor'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIVendor"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIVendor"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIApplicationScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIApplicationScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIApplicationScope"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIKeyScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKeyScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIKeyScope"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteApplicationEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ApplicationEntity"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIKey'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKey"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIKey"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIScope"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAPIKeyUsageLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKeyUsageLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."APIKeyUsageLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteApplicationRole'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationRole"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ApplicationRole"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteApplicationSetting'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationSetting"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ApplicationSetting"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArchiveConfigurationEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveConfigurationEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveConfigurationEntity"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteApplication'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteApplication"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Application"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArchiveRunDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveRunDetail"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArchiveConfiguration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveConfiguration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveConfiguration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArchiveRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifactPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifactType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifactVersionAttribute'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactVersionAttribute"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactVersionAttribute"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifactUse'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactUse"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactUse"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifactVersion'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactVersion"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactVersion"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAuditLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAuditLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AuditLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Artifact"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAuditLogType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAuditLogType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AuditLogType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAuthorizationRole'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAuthorizationRole"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AuthorizationRole"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCollectionArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCollectionArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CollectionArtifact"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCollectionPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCollectionPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CollectionPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCollection'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCollection"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Collection"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAuthorization'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAuthorization"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Authorization"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCommunicationBaseMessageType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationBaseMessageType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CommunicationBaseMessageType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCommunicationProviderMessageType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationProviderMessageType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CommunicationProviderMessageType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCommunicationProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationProvider"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CommunicationProvider"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCommunicationLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CommunicationLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompany'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompany"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Company"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCommunicationRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CommunicationRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegrationRunDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationRunDetail"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegrationRecordMap'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRecordMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationRecordMap"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegrationRunAPILog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRunAPILog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationRunAPILog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegrationFieldMap'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationFieldMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationFieldMap"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegrationEntityMap'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationEntityMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationEntityMap"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegrationRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteComponentLibrary'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteComponentLibrary"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ComponentLibrary"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteComponentDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteComponentDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ComponentDependency"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCompanyIntegrationSyncWatermark'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationSyncWatermark"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteComponentLibraryLink'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteComponentLibraryLink"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ComponentLibraryLink"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteComponent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteComponent"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Component"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentFileType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentFileType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentFileType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteComponentRegistry'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteComponentRegistry"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ComponentRegistry"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentItemAttribute'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemAttribute"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItemAttribute"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentItemTag'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentItemDuplicate'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemDuplicate"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItemDuplicate"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentProcessRunPromptRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentProcessRunPromptRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentProcessRunPromptRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentProcessRunDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentProcessRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentProcessRunDetail"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentProcessRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentProcessRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentProcessRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentSourceTypeParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentSourceTypeParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSourceTypeParam"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentSourceType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentSourceType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSourceType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentSourceParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentSourceParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSourceParam"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentSource'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentSource"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentSource"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationArtifactPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifactPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationArtifactPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteContentTypeAttribute'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteContentTypeAttribute"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentTypeAttribute"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationArtifactVersion'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifactVersion"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJConversationDetails_ArtifactVersionIDID UUID;
    p_MJConversationDetails_ArtifactVersionID_ConversationID UUID;
    p_MJConversationDetails_ArtifactVersionID_ExternalID VARCHAR(100);
    p_MJConversationDetails_ArtifactVersionID_Role VARCHAR(20);
    p_MJConversationDetails_ArtifactVersionID_Message TEXT;
    p_MJConversationDetails_ArtifactVersionID_Error TEXT;
    p_MJConversationDetails_ArtifactVersionID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_ArtifactVersionID_UserRating INTEGER;
    p_MJConversationDetails_ArtifactVersionID_UserFeedback TEXT;
    p_MJConversationDetails_ArtifactVersionID_ReflectionInsights TEXT;
    p_MJConversationDetails_ArtifactVersionID_SummaryOfEarlie_0dd4da TEXT;
    p_MJConversationDetails_ArtifactVersionID_UserID UUID;
    p_MJConversationDetails_ArtifactVersionID_ArtifactID UUID;
    p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID UUID;
    p_MJConversationDetails_ArtifactVersionID_CompletionTime BIGINT;
    p_MJConversationDetails_ArtifactVersionID_IsPinned BOOLEAN;
    p_MJConversationDetails_ArtifactVersionID_ParentID UUID;
    p_MJConversationDetails_ArtifactVersionID_AgentID UUID;
    p_MJConversationDetails_ArtifactVersionID_Status VARCHAR(20);
    p_MJConversationDetails_ArtifactVersionID_SuggestedResponses TEXT;
    p_MJConversationDetails_ArtifactVersionID_TestRunID UUID;
    p_MJConversationDetails_ArtifactVersionID_ResponseForm TEXT;
    p_MJConversationDetails_ArtifactVersionID_ActionableCommands TEXT;
    p_MJConversationDetails_ArtifactVersionID_AutomaticCommands TEXT;
    p_MJConversationDetails_ArtifactVersionID_OriginalMessage_672e5e BOOLEAN;
BEGIN
-- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged" FROM __mj."ConversationDetail" WHERE "ArtifactVersionID" = p_ID
    LOOP
        p_MJConversationDetails_ArtifactVersionIDID := _rec."ID";
        p_MJConversationDetails_ArtifactVersionID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_ArtifactVersionID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_ArtifactVersionID_Role := _rec."Role";
        p_MJConversationDetails_ArtifactVersionID_Message := _rec."Message";
        p_MJConversationDetails_ArtifactVersionID_Error := _rec."Error";
        p_MJConversationDetails_ArtifactVersionID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_ArtifactVersionID_UserRating := _rec."UserRating";
        p_MJConversationDetails_ArtifactVersionID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_ArtifactVersionID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_ArtifactVersionID_SummaryOfEarlie_0dd4da := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_ArtifactVersionID_UserID := _rec."UserID";
        p_MJConversationDetails_ArtifactVersionID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_ArtifactVersionID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_ArtifactVersionID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_ArtifactVersionID_ParentID := _rec."ParentID";
        p_MJConversationDetails_ArtifactVersionID_AgentID := _rec."AgentID";
        p_MJConversationDetails_ArtifactVersionID_Status := _rec."Status";
        p_MJConversationDetails_ArtifactVersionID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_ArtifactVersionID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_ArtifactVersionID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_ArtifactVersionID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_ArtifactVersionID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_ArtifactVersionID_OriginalMessage_672e5e := _rec."OriginalMessageChanged";
        -- Set the FK field to NULL
        p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ArtifactVersionIDID, p_ConversationID => p_MJConversationDetails_ArtifactVersionID_ConversationID, p_ExternalID => p_MJConversationDetails_ArtifactVersionID_ExternalID, p_Role => p_MJConversationDetails_ArtifactVersionID_Role, p_Message => p_MJConversationDetails_ArtifactVersionID_Message, p_Error => p_MJConversationDetails_ArtifactVersionID_Error, p_HiddenToUser => p_MJConversationDetails_ArtifactVersionID_HiddenToUser, p_UserRating => p_MJConversationDetails_ArtifactVersionID_UserRating, p_UserFeedback => p_MJConversationDetails_ArtifactVersionID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ArtifactVersionID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ArtifactVersionID_SummaryOfEarlie_0dd4da, p_UserID => p_MJConversationDetails_ArtifactVersionID_UserID, p_ArtifactID => p_MJConversationDetails_ArtifactVersionID_ArtifactID, p_ArtifactVersionID_Clear => 1, p_ArtifactVersionID => p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ArtifactVersionID_CompletionTime, p_IsPinned => p_MJConversationDetails_ArtifactVersionID_IsPinned, p_ParentID => p_MJConversationDetails_ArtifactVersionID_ParentID, p_AgentID => p_MJConversationDetails_ArtifactVersionID_AgentID, p_Status => p_MJConversationDetails_ArtifactVersionID_Status, p_SuggestedResponses => p_MJConversationDetails_ArtifactVersionID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ArtifactVersionID_TestRunID, p_ResponseForm => p_MJConversationDetails_ArtifactVersionID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ArtifactVersionID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ArtifactVersionID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ArtifactVersionID_OriginalMessage_672e5e);

    END LOOP;

    

    DELETE FROM
        __mj."ConversationArtifactVersion"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJConversationArtifactPermissions_ConversationArtifactIDID UUID;
    p_MJConversationArtifactVersions_ConversationArtifactIDID UUID;
    p_MJConversationDetails_ArtifactIDID UUID;
    p_MJConversationDetails_ArtifactID_ConversationID UUID;
    p_MJConversationDetails_ArtifactID_ExternalID VARCHAR(100);
    p_MJConversationDetails_ArtifactID_Role VARCHAR(20);
    p_MJConversationDetails_ArtifactID_Message TEXT;
    p_MJConversationDetails_ArtifactID_Error TEXT;
    p_MJConversationDetails_ArtifactID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_ArtifactID_UserRating INTEGER;
    p_MJConversationDetails_ArtifactID_UserFeedback TEXT;
    p_MJConversationDetails_ArtifactID_ReflectionInsights TEXT;
    p_MJConversationDetails_ArtifactID_SummaryOfEarlierConversation TEXT;
    p_MJConversationDetails_ArtifactID_UserID UUID;
    p_MJConversationDetails_ArtifactID_ArtifactID UUID;
    p_MJConversationDetails_ArtifactID_ArtifactVersionID UUID;
    p_MJConversationDetails_ArtifactID_CompletionTime BIGINT;
    p_MJConversationDetails_ArtifactID_IsPinned BOOLEAN;
    p_MJConversationDetails_ArtifactID_ParentID UUID;
    p_MJConversationDetails_ArtifactID_AgentID UUID;
    p_MJConversationDetails_ArtifactID_Status VARCHAR(20);
    p_MJConversationDetails_ArtifactID_SuggestedResponses TEXT;
    p_MJConversationDetails_ArtifactID_TestRunID UUID;
    p_MJConversationDetails_ArtifactID_ResponseForm TEXT;
    p_MJConversationDetails_ArtifactID_ActionableCommands TEXT;
    p_MJConversationDetails_ArtifactID_AutomaticCommands TEXT;
    p_MJConversationDetails_ArtifactID_OriginalMessageChanged BOOLEAN;
BEGIN
-- Cascade delete from ConversationArtifactPermission using cursor to call spDeleteConversationArtifactPermission

    FOR _rec IN SELECT "ID" FROM __mj."ConversationArtifactPermission" WHERE "ConversationArtifactID" = p_ID
    LOOP
        p_MJConversationArtifactPermissions_ConversationArtifactIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationArtifactPermission"(p_ID => p_MJConversationArtifactPermissions_ConversationArtifactIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationArtifactVersion using cursor to call spDeleteConversationArtifactVersion

    FOR _rec IN SELECT "ID" FROM __mj."ConversationArtifactVersion" WHERE "ConversationArtifactID" = p_ID
    LOOP
        p_MJConversationArtifactVersions_ConversationArtifactIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationArtifactVersion"(p_ID => p_MJConversationArtifactVersions_ConversationArtifactIDID);
        
    END LOOP;
    
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged" FROM __mj."ConversationDetail" WHERE "ArtifactID" = p_ID
    LOOP
        p_MJConversationDetails_ArtifactIDID := _rec."ID";
        p_MJConversationDetails_ArtifactID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_ArtifactID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_ArtifactID_Role := _rec."Role";
        p_MJConversationDetails_ArtifactID_Message := _rec."Message";
        p_MJConversationDetails_ArtifactID_Error := _rec."Error";
        p_MJConversationDetails_ArtifactID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_ArtifactID_UserRating := _rec."UserRating";
        p_MJConversationDetails_ArtifactID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_ArtifactID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_ArtifactID_SummaryOfEarlierConversation := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_ArtifactID_UserID := _rec."UserID";
        p_MJConversationDetails_ArtifactID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_ArtifactID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_ArtifactID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_ArtifactID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_ArtifactID_ParentID := _rec."ParentID";
        p_MJConversationDetails_ArtifactID_AgentID := _rec."AgentID";
        p_MJConversationDetails_ArtifactID_Status := _rec."Status";
        p_MJConversationDetails_ArtifactID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_ArtifactID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_ArtifactID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_ArtifactID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_ArtifactID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_ArtifactID_OriginalMessageChanged := _rec."OriginalMessageChanged";
        -- Set the FK field to NULL
        p_MJConversationDetails_ArtifactID_ArtifactID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ArtifactIDID, p_ConversationID => p_MJConversationDetails_ArtifactID_ConversationID, p_ExternalID => p_MJConversationDetails_ArtifactID_ExternalID, p_Role => p_MJConversationDetails_ArtifactID_Role, p_Message => p_MJConversationDetails_ArtifactID_Message, p_Error => p_MJConversationDetails_ArtifactID_Error, p_HiddenToUser => p_MJConversationDetails_ArtifactID_HiddenToUser, p_UserRating => p_MJConversationDetails_ArtifactID_UserRating, p_UserFeedback => p_MJConversationDetails_ArtifactID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ArtifactID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_ArtifactID_UserID, p_ArtifactID_Clear => 1, p_ArtifactID => p_MJConversationDetails_ArtifactID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_ArtifactID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ArtifactID_CompletionTime, p_IsPinned => p_MJConversationDetails_ArtifactID_IsPinned, p_ParentID => p_MJConversationDetails_ArtifactID_ParentID, p_AgentID => p_MJConversationDetails_ArtifactID_AgentID, p_Status => p_MJConversationDetails_ArtifactID_Status, p_SuggestedResponses => p_MJConversationDetails_ArtifactID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ArtifactID_TestRunID, p_ResponseForm => p_MJConversationDetails_ArtifactID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ArtifactID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ArtifactID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ArtifactID_OriginalMessageChanged);

    END LOOP;

    

    DELETE FROM
        __mj."ConversationArtifact"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetailAttachment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailAttachment"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailAttachment"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetailRating'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailRating"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailRating"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetailArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailArtifact"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentExamples_SourceConversationIDID UUID;
    p_MJAIAgentExamples_SourceConversationID_AgentID UUID;
    p_MJAIAgentExamples_SourceConversationID_UserID UUID;
    p_MJAIAgentExamples_SourceConversationID_CompanyID UUID;
    p_MJAIAgentExamples_SourceConversationID_Type VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationID_ExampleInput TEXT;
    p_MJAIAgentExamples_SourceConversationID_ExampleOutput TEXT;
    p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentExamples_SourceConversationID_SourceConversationID UUID;
    p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5 UUID;
    p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID UUID;
    p_MJAIAgentExamples_SourceConversationID_SuccessScore NUMERIC(5,2);
    p_MJAIAgentExamples_SourceConversationID_Comments TEXT;
    p_MJAIAgentExamples_SourceConversationID_Status VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationID_EmbeddingVector TEXT;
    p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID UUID;
    p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentExamples_SourceConversationID_SecondaryScopes TEXT;
    p_MJAIAgentExamples_SourceConversationID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentExamples_SourceConversationID_AccessCount INTEGER;
    p_MJAIAgentExamples_SourceConversationID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationIDID UUID;
    p_MJAIAgentNotes_SourceConversationID_AgentID UUID;
    p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_SourceConversationID_Note TEXT;
    p_MJAIAgentNotes_SourceConversationID_UserID UUID;
    p_MJAIAgentNotes_SourceConversationID_Type VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_SourceConversationID_Comments TEXT;
    p_MJAIAgentNotes_SourceConversationID_Status VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_SourceConversationID UUID;
    p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992 UUID;
    p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_SourceConversationID_CompanyID UUID;
    p_MJAIAgentNotes_SourceConversationID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_SourceConversationID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_SourceConversationID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationID_AccessCount INTEGER;
    p_MJAIAgentNotes_SourceConversationID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_SourceConversationID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_SourceConversationID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentRuns_ConversationIDID UUID;
    p_MJAIAgentRuns_ConversationID_AgentID UUID;
    p_MJAIAgentRuns_ConversationID_ParentRunID UUID;
    p_MJAIAgentRuns_ConversationID_Status VARCHAR(50);
    p_MJAIAgentRuns_ConversationID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_Success BOOLEAN;
    p_MJAIAgentRuns_ConversationID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ConversationID_ConversationID UUID;
    p_MJAIAgentRuns_ConversationID_UserID UUID;
    p_MJAIAgentRuns_ConversationID_Result TEXT;
    p_MJAIAgentRuns_ConversationID_AgentState TEXT;
    p_MJAIAgentRuns_ConversationID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ConversationID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ConversationID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ConversationID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ConversationID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ConversationID_FinalPayload TEXT;
    p_MJAIAgentRuns_ConversationID_Message TEXT;
    p_MJAIAgentRuns_ConversationID_LastRunID UUID;
    p_MJAIAgentRuns_ConversationID_StartingPayload TEXT;
    p_MJAIAgentRuns_ConversationID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ConversationID_ConfigurationID UUID;
    p_MJAIAgentRuns_ConversationID_OverrideModelID UUID;
    p_MJAIAgentRuns_ConversationID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ConversationID_Data TEXT;
    p_MJAIAgentRuns_ConversationID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ConversationID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ConversationID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ConversationID_Comments TEXT;
    p_MJAIAgentRuns_ConversationID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ConversationID_TestRunID UUID;
    p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ConversationID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ConversationID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ConversationID_CompanyID UUID;
    p_MJConversationArtifacts_ConversationIDID UUID;
    p_MJConversationDetails_ConversationIDID UUID;
    p_MJReports_ConversationIDID UUID;
    p_MJReports_ConversationID_Name VARCHAR(255);
    p_MJReports_ConversationID_Description TEXT;
    p_MJReports_ConversationID_CategoryID UUID;
    p_MJReports_ConversationID_UserID UUID;
    p_MJReports_ConversationID_SharingScope VARCHAR(20);
    p_MJReports_ConversationID_ConversationID UUID;
    p_MJReports_ConversationID_ConversationDetailID UUID;
    p_MJReports_ConversationID_DataContextID UUID;
    p_MJReports_ConversationID_Configuration TEXT;
    p_MJReports_ConversationID_OutputTriggerTypeID UUID;
    p_MJReports_ConversationID_OutputFormatTypeID UUID;
    p_MJReports_ConversationID_OutputDeliveryTypeID UUID;
    p_MJReports_ConversationID_OutputFrequency VARCHAR(50);
    p_MJReports_ConversationID_OutputTargetEmail VARCHAR(255);
    p_MJReports_ConversationID_OutputWorkflowID UUID;
    p_MJReports_ConversationID_Thumbnail TEXT;
    p_MJReports_ConversationID_EnvironmentID UUID;
BEGIN
-- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentExample" WHERE "SourceConversationID" = p_ID
    LOOP
        p_MJAIAgentExamples_SourceConversationIDID := _rec."ID";
        p_MJAIAgentExamples_SourceConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentExamples_SourceConversationID_UserID := _rec."UserID";
        p_MJAIAgentExamples_SourceConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentExamples_SourceConversationID_Type := _rec."Type";
        p_MJAIAgentExamples_SourceConversationID_ExampleInput := _rec."ExampleInput";
        p_MJAIAgentExamples_SourceConversationID_ExampleOutput := _rec."ExampleOutput";
        p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentExamples_SourceConversationID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5 := _rec."SourceConversationDetailID";
        p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentExamples_SourceConversationID_SuccessScore := _rec."SuccessScore";
        p_MJAIAgentExamples_SourceConversationID_Comments := _rec."Comments";
        p_MJAIAgentExamples_SourceConversationID_Status := _rec."Status";
        p_MJAIAgentExamples_SourceConversationID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentExamples_SourceConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentExamples_SourceConversationID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentExamples_SourceConversationID_AccessCount := _rec."AccessCount";
        p_MJAIAgentExamples_SourceConversationID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentExamples_SourceConversationID_SourceConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentExample"(p_ID => p_MJAIAgentExamples_SourceConversationIDID, p_AgentID => p_MJAIAgentExamples_SourceConversationID_AgentID, p_UserID => p_MJAIAgentExamples_SourceConversationID_UserID, p_CompanyID => p_MJAIAgentExamples_SourceConversationID_CompanyID, p_Type => p_MJAIAgentExamples_SourceConversationID_Type, p_ExampleInput => p_MJAIAgentExamples_SourceConversationID_ExampleInput, p_ExampleOutput => p_MJAIAgentExamples_SourceConversationID_ExampleOutput, p_IsAutoGenerated => p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated, p_SourceConversationID_Clear => 1, p_SourceConversationID => p_MJAIAgentExamples_SourceConversationID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5, p_SourceAIAgentRunID => p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, p_SuccessScore => p_MJAIAgentExamples_SourceConversationID_SuccessScore, p_Comments => p_MJAIAgentExamples_SourceConversationID_Comments, p_Status => p_MJAIAgentExamples_SourceConversationID_Status, p_EmbeddingVector => p_MJAIAgentExamples_SourceConversationID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentExamples_SourceConversationID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentExamples_SourceConversationID_LastAccessedAt, p_AccessCount => p_MJAIAgentExamples_SourceConversationID_AccessCount, p_ExpiresAt => p_MJAIAgentExamples_SourceConversationID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore" FROM __mj."AIAgentNote" WHERE "SourceConversationID" = p_ID
    LOOP
        p_MJAIAgentNotes_SourceConversationIDID := _rec."ID";
        p_MJAIAgentNotes_SourceConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_SourceConversationID_Note := _rec."Note";
        p_MJAIAgentNotes_SourceConversationID_UserID := _rec."UserID";
        p_MJAIAgentNotes_SourceConversationID_Type := _rec."Type";
        p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_SourceConversationID_Comments := _rec."Comments";
        p_MJAIAgentNotes_SourceConversationID_Status := _rec."Status";
        p_MJAIAgentNotes_SourceConversationID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992 := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_SourceConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_SourceConversationID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_SourceConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_SourceConversationID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_SourceConversationID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_SourceConversationID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_SourceConversationID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_SourceConversationID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_SourceConversationID_ImportanceScore := _rec."ImportanceScore";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceConversationID_SourceConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceConversationIDID, p_AgentID => p_MJAIAgentNotes_SourceConversationID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceConversationID_Note, p_UserID => p_MJAIAgentNotes_SourceConversationID_UserID, p_Type => p_MJAIAgentNotes_SourceConversationID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceConversationID_Comments, p_Status => p_MJAIAgentNotes_SourceConversationID_Status, p_SourceConversationID_Clear => 1, p_SourceConversationID => p_MJAIAgentNotes_SourceConversationID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceConversationID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceConversationID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_SourceConversationID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceConversationID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceConversationID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceConversationID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_SourceConversationID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceConversationID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceConversationID_ImportanceScore);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "ConversationID" = p_ID
    LOOP
        p_MJAIAgentRuns_ConversationIDID := _rec."ID";
        p_MJAIAgentRuns_ConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ConversationID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ConversationID_Status := _rec."Status";
        p_MJAIAgentRuns_ConversationID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ConversationID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ConversationID_Success := _rec."Success";
        p_MJAIAgentRuns_ConversationID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ConversationID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ConversationID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ConversationID_Result := _rec."Result";
        p_MJAIAgentRuns_ConversationID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ConversationID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ConversationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ConversationID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ConversationID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ConversationID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ConversationID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ConversationID_Message := _rec."Message";
        p_MJAIAgentRuns_ConversationID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ConversationID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ConversationID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ConversationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ConversationID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ConversationID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ConversationID_Data := _rec."Data";
        p_MJAIAgentRuns_ConversationID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ConversationID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ConversationID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ConversationID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ConversationID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ConversationID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ConversationID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ConversationID_CompanyID := _rec."CompanyID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationIDID, p_AgentID => p_MJAIAgentRuns_ConversationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationID_ErrorMessage, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentRuns_ConversationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationID_UserID, p_Result => p_MJAIAgentRuns_ConversationID_Result, p_AgentState => p_MJAIAgentRuns_ConversationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConversationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConversationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationID_Data, p_Verbose => p_MJAIAgentRuns_ConversationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationID_RunName, p_Comments => p_MJAIAgentRuns_ConversationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationID_CompanyID);

    END LOOP;

    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact

    FOR _rec IN SELECT "ID" FROM __mj."ConversationArtifact" WHERE "ConversationID" = p_ID
    LOOP
        p_MJConversationArtifacts_ConversationIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationArtifact"(p_ID => p_MJConversationArtifacts_ConversationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetail" WHERE "ConversationID" = p_ID
    LOOP
        p_MJConversationDetails_ConversationIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetail"(p_ID => p_MJConversationDetails_ConversationIDID);
        
    END LOOP;
    
    
    -- Cascade update on Report using cursor to call spUpdateReport


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID" FROM __mj."Report" WHERE "ConversationID" = p_ID
    LOOP
        p_MJReports_ConversationIDID := _rec."ID";
        p_MJReports_ConversationID_Name := _rec."Name";
        p_MJReports_ConversationID_Description := _rec."Description";
        p_MJReports_ConversationID_CategoryID := _rec."CategoryID";
        p_MJReports_ConversationID_UserID := _rec."UserID";
        p_MJReports_ConversationID_SharingScope := _rec."SharingScope";
        p_MJReports_ConversationID_ConversationID := _rec."ConversationID";
        p_MJReports_ConversationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJReports_ConversationID_DataContextID := _rec."DataContextID";
        p_MJReports_ConversationID_Configuration := _rec."Configuration";
        p_MJReports_ConversationID_OutputTriggerTypeID := _rec."OutputTriggerTypeID";
        p_MJReports_ConversationID_OutputFormatTypeID := _rec."OutputFormatTypeID";
        p_MJReports_ConversationID_OutputDeliveryTypeID := _rec."OutputDeliveryTypeID";
        p_MJReports_ConversationID_OutputFrequency := _rec."OutputFrequency";
        p_MJReports_ConversationID_OutputTargetEmail := _rec."OutputTargetEmail";
        p_MJReports_ConversationID_OutputWorkflowID := _rec."OutputWorkflowID";
        p_MJReports_ConversationID_Thumbnail := _rec."Thumbnail";
        p_MJReports_ConversationID_EnvironmentID := _rec."EnvironmentID";
        -- Set the FK field to NULL
        p_MJReports_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateReport"(p_ID => p_MJReports_ConversationIDID, p_Name => p_MJReports_ConversationID_Name, p_Description => p_MJReports_ConversationID_Description, p_CategoryID => p_MJReports_ConversationID_CategoryID, p_UserID => p_MJReports_ConversationID_UserID, p_SharingScope => p_MJReports_ConversationID_SharingScope, p_ConversationID_Clear => 1, p_ConversationID => p_MJReports_ConversationID_ConversationID, p_ConversationDetailID => p_MJReports_ConversationID_ConversationDetailID, p_DataContextID => p_MJReports_ConversationID_DataContextID, p_Configuration => p_MJReports_ConversationID_Configuration, p_OutputTriggerTypeID => p_MJReports_ConversationID_OutputTriggerTypeID, p_OutputFormatTypeID => p_MJReports_ConversationID_OutputFormatTypeID, p_OutputDeliveryTypeID => p_MJReports_ConversationID_OutputDeliveryTypeID, p_OutputFrequency => p_MJReports_ConversationID_OutputFrequency, p_OutputTargetEmail => p_MJReports_ConversationID_OutputTargetEmail, p_OutputWorkflowID => p_MJReports_ConversationID_OutputWorkflowID, p_Thumbnail => p_MJReports_ConversationID_Thumbnail, p_EnvironmentID => p_MJReports_ConversationID_EnvironmentID);

    END LOOP;

    

    DELETE FROM
        __mj."Conversation"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentExamples_SourceConversationDetailIDID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_AgentID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_UserID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_CompanyID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_Type VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationDetailID_ExampleInput TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_ExampleOutput TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_b3263f UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540 UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_SourceAIAg_987eaf UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_SuccessScore NUMERIC(5,2);
    p_MJAIAgentExamples_SourceConversationDetailID_Comments TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_Status VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_8c9509 UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_da3d2d VARCHAR(100);
    p_MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentExamples_SourceConversationDetailID_AccessCount INTEGER;
    p_MJAIAgentExamples_SourceConversationDetailID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationDetailIDID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_AgentID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_Note TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_UserID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_Type VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_SourceConversationDetailID_Comments TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_Status VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_d7e41b UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_CompanyID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeE_b152e5 UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeR_fefb0a VARCHAR(100);
    p_MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationDetailID_AccessCount INTEGER;
    p_MJAIAgentNotes_SourceConversationDetailID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationDetailID_ConsolidatedI_88bda0 UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationDetailID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentRuns_ConversationDetailIDID UUID;
    p_MJAIAgentRuns_ConversationDetailID_AgentID UUID;
    p_MJAIAgentRuns_ConversationDetailID_ParentRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_Status VARCHAR(50);
    p_MJAIAgentRuns_ConversationDetailID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationDetailID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationDetailID_Success BOOLEAN;
    p_MJAIAgentRuns_ConversationDetailID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ConversationDetailID_ConversationID UUID;
    p_MJAIAgentRuns_ConversationDetailID_UserID UUID;
    p_MJAIAgentRuns_ConversationDetailID_Result TEXT;
    p_MJAIAgentRuns_ConversationDetailID_AgentState TEXT;
    p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ConversationDetailID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ConversationDetailID_FinalPayload TEXT;
    p_MJAIAgentRuns_ConversationDetailID_Message TEXT;
    p_MJAIAgentRuns_ConversationDetailID_LastRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_StartingPayload TEXT;
    p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_ConfigurationID UUID;
    p_MJAIAgentRuns_ConversationDetailID_OverrideModelID UUID;
    p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ConversationDetailID_Data TEXT;
    p_MJAIAgentRuns_ConversationDetailID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ConversationDetailID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ConversationDetailID_Comments TEXT;
    p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_TestRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ConversationDetailID_CompanyID UUID;
    p_MJConversationDetailArtifacts_ConversationDetailIDID UUID;
    p_MJConversationDetailAttachments_ConversationDetailIDID UUID;
    p_MJConversationDetailRatings_ConversationDetailIDID UUID;
    p_MJConversationDetails_ParentIDID UUID;
    p_MJConversationDetails_ParentID_ConversationID UUID;
    p_MJConversationDetails_ParentID_ExternalID VARCHAR(100);
    p_MJConversationDetails_ParentID_Role VARCHAR(20);
    p_MJConversationDetails_ParentID_Message TEXT;
    p_MJConversationDetails_ParentID_Error TEXT;
    p_MJConversationDetails_ParentID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_ParentID_UserRating INTEGER;
    p_MJConversationDetails_ParentID_UserFeedback TEXT;
    p_MJConversationDetails_ParentID_ReflectionInsights TEXT;
    p_MJConversationDetails_ParentID_SummaryOfEarlierConversation TEXT;
    p_MJConversationDetails_ParentID_UserID UUID;
    p_MJConversationDetails_ParentID_ArtifactID UUID;
    p_MJConversationDetails_ParentID_ArtifactVersionID UUID;
    p_MJConversationDetails_ParentID_CompletionTime BIGINT;
    p_MJConversationDetails_ParentID_IsPinned BOOLEAN;
    p_MJConversationDetails_ParentID_ParentID UUID;
    p_MJConversationDetails_ParentID_AgentID UUID;
    p_MJConversationDetails_ParentID_Status VARCHAR(20);
    p_MJConversationDetails_ParentID_SuggestedResponses TEXT;
    p_MJConversationDetails_ParentID_TestRunID UUID;
    p_MJConversationDetails_ParentID_ResponseForm TEXT;
    p_MJConversationDetails_ParentID_ActionableCommands TEXT;
    p_MJConversationDetails_ParentID_AutomaticCommands TEXT;
    p_MJConversationDetails_ParentID_OriginalMessageChanged BOOLEAN;
    p_MJReports_ConversationDetailIDID UUID;
    p_MJReports_ConversationDetailID_Name VARCHAR(255);
    p_MJReports_ConversationDetailID_Description TEXT;
    p_MJReports_ConversationDetailID_CategoryID UUID;
    p_MJReports_ConversationDetailID_UserID UUID;
    p_MJReports_ConversationDetailID_SharingScope VARCHAR(20);
    p_MJReports_ConversationDetailID_ConversationID UUID;
    p_MJReports_ConversationDetailID_ConversationDetailID UUID;
    p_MJReports_ConversationDetailID_DataContextID UUID;
    p_MJReports_ConversationDetailID_Configuration TEXT;
    p_MJReports_ConversationDetailID_OutputTriggerTypeID UUID;
    p_MJReports_ConversationDetailID_OutputFormatTypeID UUID;
    p_MJReports_ConversationDetailID_OutputDeliveryTypeID UUID;
    p_MJReports_ConversationDetailID_OutputFrequency VARCHAR(50);
    p_MJReports_ConversationDetailID_OutputTargetEmail VARCHAR(255);
    p_MJReports_ConversationDetailID_OutputWorkflowID UUID;
    p_MJReports_ConversationDetailID_Thumbnail TEXT;
    p_MJReports_ConversationDetailID_EnvironmentID UUID;
    p_MJTasks_ConversationDetailIDID UUID;
    p_MJTasks_ConversationDetailID_ParentID UUID;
    p_MJTasks_ConversationDetailID_Name VARCHAR(255);
    p_MJTasks_ConversationDetailID_Description TEXT;
    p_MJTasks_ConversationDetailID_TypeID UUID;
    p_MJTasks_ConversationDetailID_EnvironmentID UUID;
    p_MJTasks_ConversationDetailID_ProjectID UUID;
    p_MJTasks_ConversationDetailID_ConversationDetailID UUID;
    p_MJTasks_ConversationDetailID_UserID UUID;
    p_MJTasks_ConversationDetailID_AgentID UUID;
    p_MJTasks_ConversationDetailID_Status VARCHAR(50);
    p_MJTasks_ConversationDetailID_PercentComplete INTEGER;
    p_MJTasks_ConversationDetailID_DueAt TIMESTAMPTZ;
    p_MJTasks_ConversationDetailID_StartedAt TIMESTAMPTZ;
    p_MJTasks_ConversationDetailID_CompletedAt TIMESTAMPTZ;
BEGIN
-- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentExample" WHERE "SourceConversationDetailID" = p_ID
    LOOP
        p_MJAIAgentExamples_SourceConversationDetailIDID := _rec."ID";
        p_MJAIAgentExamples_SourceConversationDetailID_AgentID := _rec."AgentID";
        p_MJAIAgentExamples_SourceConversationDetailID_UserID := _rec."UserID";
        p_MJAIAgentExamples_SourceConversationDetailID_CompanyID := _rec."CompanyID";
        p_MJAIAgentExamples_SourceConversationDetailID_Type := _rec."Type";
        p_MJAIAgentExamples_SourceConversationDetailID_ExampleInput := _rec."ExampleInput";
        p_MJAIAgentExamples_SourceConversationDetailID_ExampleOutput := _rec."ExampleOutput";
        p_MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_b3263f := _rec."SourceConversationID";
        p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540 := _rec."SourceConversationDetailID";
        p_MJAIAgentExamples_SourceConversationDetailID_SourceAIAg_987eaf := _rec."SourceAIAgentRunID";
        p_MJAIAgentExamples_SourceConversationDetailID_SuccessScore := _rec."SuccessScore";
        p_MJAIAgentExamples_SourceConversationDetailID_Comments := _rec."Comments";
        p_MJAIAgentExamples_SourceConversationDetailID_Status := _rec."Status";
        p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_8c9509 := _rec."PrimaryScopeEntityID";
        p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_da3d2d := _rec."PrimaryScopeRecordID";
        p_MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentExamples_SourceConversationDetailID_AccessCount := _rec."AccessCount";
        p_MJAIAgentExamples_SourceConversationDetailID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentExample"(p_ID => p_MJAIAgentExamples_SourceConversationDetailIDID, p_AgentID => p_MJAIAgentExamples_SourceConversationDetailID_AgentID, p_UserID => p_MJAIAgentExamples_SourceConversationDetailID_UserID, p_CompanyID => p_MJAIAgentExamples_SourceConversationDetailID_CompanyID, p_Type => p_MJAIAgentExamples_SourceConversationDetailID_Type, p_ExampleInput => p_MJAIAgentExamples_SourceConversationDetailID_ExampleInput, p_ExampleOutput => p_MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, p_IsAutoGenerated => p_MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, p_SourceConversationID => p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_b3263f, p_SourceConversationDetailID_Clear => 1, p_SourceConversationDetailID => p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540, p_SourceAIAgentRunID => p_MJAIAgentExamples_SourceConversationDetailID_SourceAIAg_987eaf, p_SuccessScore => p_MJAIAgentExamples_SourceConversationDetailID_SuccessScore, p_Comments => p_MJAIAgentExamples_SourceConversationDetailID_Comments, p_Status => p_MJAIAgentExamples_SourceConversationDetailID_Status, p_EmbeddingVector => p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_8c9509, p_PrimaryScopeRecordID => p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_da3d2d, p_SecondaryScopes => p_MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, p_AccessCount => p_MJAIAgentExamples_SourceConversationDetailID_AccessCount, p_ExpiresAt => p_MJAIAgentExamples_SourceConversationDetailID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore" FROM __mj."AIAgentNote" WHERE "SourceConversationDetailID" = p_ID
    LOOP
        p_MJAIAgentNotes_SourceConversationDetailIDID := _rec."ID";
        p_MJAIAgentNotes_SourceConversationDetailID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_SourceConversationDetailID_Note := _rec."Note";
        p_MJAIAgentNotes_SourceConversationDetailID_UserID := _rec."UserID";
        p_MJAIAgentNotes_SourceConversationDetailID_Type := _rec."Type";
        p_MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_SourceConversationDetailID_Comments := _rec."Comments";
        p_MJAIAgentNotes_SourceConversationDetailID_Status := _rec."Status";
        p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_d7e41b := _rec."SourceConversationID";
        p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_SourceConversationDetailID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeE_b152e5 := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeR_fefb0a := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_SourceConversationDetailID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_SourceConversationDetailID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_SourceConversationDetailID_ConsolidatedI_88bda0 := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_SourceConversationDetailID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_SourceConversationDetailID_ImportanceScore := _rec."ImportanceScore";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceConversationDetailIDID, p_AgentID => p_MJAIAgentNotes_SourceConversationDetailID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceConversationDetailID_Note, p_UserID => p_MJAIAgentNotes_SourceConversationDetailID_UserID, p_Type => p_MJAIAgentNotes_SourceConversationDetailID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceConversationDetailID_Comments, p_Status => p_MJAIAgentNotes_SourceConversationDetailID_Status, p_SourceConversationID => p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_d7e41b, p_SourceConversationDetailID_Clear => 1, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceConversationDetailID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeE_b152e5, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeR_fefb0a, p_SecondaryScopes => p_MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceConversationDetailID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceConversationDetailID_ConsolidatedI_88bda0, p_ConsolidationCount => p_MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceConversationDetailID_ImportanceScore);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJAIAgentRuns_ConversationDetailIDID := _rec."ID";
        p_MJAIAgentRuns_ConversationDetailID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ConversationDetailID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ConversationDetailID_Status := _rec."Status";
        p_MJAIAgentRuns_ConversationDetailID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ConversationDetailID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ConversationDetailID_Success := _rec."Success";
        p_MJAIAgentRuns_ConversationDetailID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ConversationDetailID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ConversationDetailID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ConversationDetailID_Result := _rec."Result";
        p_MJAIAgentRuns_ConversationDetailID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ConversationDetailID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ConversationDetailID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ConversationDetailID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ConversationDetailID_Message := _rec."Message";
        p_MJAIAgentRuns_ConversationDetailID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ConversationDetailID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ConversationDetailID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ConversationDetailID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ConversationDetailID_Data := _rec."Data";
        p_MJAIAgentRuns_ConversationDetailID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ConversationDetailID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ConversationDetailID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ConversationDetailID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ConversationDetailID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ConversationDetailID_CompanyID := _rec."CompanyID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationDetailIDID, p_AgentID => p_MJAIAgentRuns_ConversationDetailID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationDetailID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationDetailID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationDetailID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationDetailID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationDetailID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationDetailID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConversationDetailID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationDetailID_UserID, p_Result => p_MJAIAgentRuns_ConversationDetailID_Result, p_AgentState => p_MJAIAgentRuns_ConversationDetailID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationDetailID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab, p_TotalCostRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationDetailID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationDetailID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationDetailID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationDetailID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationDetailID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationDetailID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationDetailID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationDetailID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationDetailID_Data, p_Verbose => p_MJAIAgentRuns_ConversationDetailID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationDetailID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationDetailID_RunName, p_Comments => p_MJAIAgentRuns_ConversationDetailID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationDetailID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationDetailID_CompanyID);

    END LOOP;

    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetailArtifact" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJConversationDetailArtifacts_ConversationDetailIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetailArtifact"(p_ID => p_MJConversationDetailArtifacts_ConversationDetailIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetailAttachment" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJConversationDetailAttachments_ConversationDetailIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetailAttachment"(p_ID => p_MJConversationDetailAttachments_ConversationDetailIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetailRating" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJConversationDetailRatings_ConversationDetailIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetailRating"(p_ID => p_MJConversationDetailRatings_ConversationDetailIDID);
        
    END LOOP;
    
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged" FROM __mj."ConversationDetail" WHERE "ParentID" = p_ID
    LOOP
        p_MJConversationDetails_ParentIDID := _rec."ID";
        p_MJConversationDetails_ParentID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_ParentID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_ParentID_Role := _rec."Role";
        p_MJConversationDetails_ParentID_Message := _rec."Message";
        p_MJConversationDetails_ParentID_Error := _rec."Error";
        p_MJConversationDetails_ParentID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_ParentID_UserRating := _rec."UserRating";
        p_MJConversationDetails_ParentID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_ParentID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_ParentID_SummaryOfEarlierConversation := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_ParentID_UserID := _rec."UserID";
        p_MJConversationDetails_ParentID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_ParentID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_ParentID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_ParentID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_ParentID_ParentID := _rec."ParentID";
        p_MJConversationDetails_ParentID_AgentID := _rec."AgentID";
        p_MJConversationDetails_ParentID_Status := _rec."Status";
        p_MJConversationDetails_ParentID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_ParentID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_ParentID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_ParentID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_ParentID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_ParentID_OriginalMessageChanged := _rec."OriginalMessageChanged";
        -- Set the FK field to NULL
        p_MJConversationDetails_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ParentIDID, p_ConversationID => p_MJConversationDetails_ParentID_ConversationID, p_ExternalID => p_MJConversationDetails_ParentID_ExternalID, p_Role => p_MJConversationDetails_ParentID_Role, p_Message => p_MJConversationDetails_ParentID_Message, p_Error => p_MJConversationDetails_ParentID_Error, p_HiddenToUser => p_MJConversationDetails_ParentID_HiddenToUser, p_UserRating => p_MJConversationDetails_ParentID_UserRating, p_UserFeedback => p_MJConversationDetails_ParentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ParentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ParentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_ParentID_UserID, p_ArtifactID => p_MJConversationDetails_ParentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_ParentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ParentID_CompletionTime, p_IsPinned => p_MJConversationDetails_ParentID_IsPinned, p_ParentID_Clear => 1, p_ParentID => p_MJConversationDetails_ParentID_ParentID, p_AgentID => p_MJConversationDetails_ParentID_AgentID, p_Status => p_MJConversationDetails_ParentID_Status, p_SuggestedResponses => p_MJConversationDetails_ParentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ParentID_TestRunID, p_ResponseForm => p_MJConversationDetails_ParentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ParentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ParentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ParentID_OriginalMessageChanged);

    END LOOP;

    
    -- Cascade update on Report using cursor to call spUpdateReport


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID" FROM __mj."Report" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJReports_ConversationDetailIDID := _rec."ID";
        p_MJReports_ConversationDetailID_Name := _rec."Name";
        p_MJReports_ConversationDetailID_Description := _rec."Description";
        p_MJReports_ConversationDetailID_CategoryID := _rec."CategoryID";
        p_MJReports_ConversationDetailID_UserID := _rec."UserID";
        p_MJReports_ConversationDetailID_SharingScope := _rec."SharingScope";
        p_MJReports_ConversationDetailID_ConversationID := _rec."ConversationID";
        p_MJReports_ConversationDetailID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJReports_ConversationDetailID_DataContextID := _rec."DataContextID";
        p_MJReports_ConversationDetailID_Configuration := _rec."Configuration";
        p_MJReports_ConversationDetailID_OutputTriggerTypeID := _rec."OutputTriggerTypeID";
        p_MJReports_ConversationDetailID_OutputFormatTypeID := _rec."OutputFormatTypeID";
        p_MJReports_ConversationDetailID_OutputDeliveryTypeID := _rec."OutputDeliveryTypeID";
        p_MJReports_ConversationDetailID_OutputFrequency := _rec."OutputFrequency";
        p_MJReports_ConversationDetailID_OutputTargetEmail := _rec."OutputTargetEmail";
        p_MJReports_ConversationDetailID_OutputWorkflowID := _rec."OutputWorkflowID";
        p_MJReports_ConversationDetailID_Thumbnail := _rec."Thumbnail";
        p_MJReports_ConversationDetailID_EnvironmentID := _rec."EnvironmentID";
        -- Set the FK field to NULL
        p_MJReports_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateReport"(p_ID => p_MJReports_ConversationDetailIDID, p_Name => p_MJReports_ConversationDetailID_Name, p_Description => p_MJReports_ConversationDetailID_Description, p_CategoryID => p_MJReports_ConversationDetailID_CategoryID, p_UserID => p_MJReports_ConversationDetailID_UserID, p_SharingScope => p_MJReports_ConversationDetailID_SharingScope, p_ConversationID => p_MJReports_ConversationDetailID_ConversationID, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJReports_ConversationDetailID_ConversationDetailID, p_DataContextID => p_MJReports_ConversationDetailID_DataContextID, p_Configuration => p_MJReports_ConversationDetailID_Configuration, p_OutputTriggerTypeID => p_MJReports_ConversationDetailID_OutputTriggerTypeID, p_OutputFormatTypeID => p_MJReports_ConversationDetailID_OutputFormatTypeID, p_OutputDeliveryTypeID => p_MJReports_ConversationDetailID_OutputDeliveryTypeID, p_OutputFrequency => p_MJReports_ConversationDetailID_OutputFrequency, p_OutputTargetEmail => p_MJReports_ConversationDetailID_OutputTargetEmail, p_OutputWorkflowID => p_MJReports_ConversationDetailID_OutputWorkflowID, p_Thumbnail => p_MJReports_ConversationDetailID_Thumbnail, p_EnvironmentID => p_MJReports_ConversationDetailID_EnvironmentID);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt" FROM __mj."Task" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJTasks_ConversationDetailIDID := _rec."ID";
        p_MJTasks_ConversationDetailID_ParentID := _rec."ParentID";
        p_MJTasks_ConversationDetailID_Name := _rec."Name";
        p_MJTasks_ConversationDetailID_Description := _rec."Description";
        p_MJTasks_ConversationDetailID_TypeID := _rec."TypeID";
        p_MJTasks_ConversationDetailID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_ConversationDetailID_ProjectID := _rec."ProjectID";
        p_MJTasks_ConversationDetailID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_ConversationDetailID_UserID := _rec."UserID";
        p_MJTasks_ConversationDetailID_AgentID := _rec."AgentID";
        p_MJTasks_ConversationDetailID_Status := _rec."Status";
        p_MJTasks_ConversationDetailID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_ConversationDetailID_DueAt := _rec."DueAt";
        p_MJTasks_ConversationDetailID_StartedAt := _rec."StartedAt";
        p_MJTasks_ConversationDetailID_CompletedAt := _rec."CompletedAt";
        -- Set the FK field to NULL
        p_MJTasks_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_ConversationDetailIDID, p_ParentID => p_MJTasks_ConversationDetailID_ParentID, p_Name => p_MJTasks_ConversationDetailID_Name, p_Description => p_MJTasks_ConversationDetailID_Description, p_TypeID => p_MJTasks_ConversationDetailID_TypeID, p_EnvironmentID => p_MJTasks_ConversationDetailID_EnvironmentID, p_ProjectID => p_MJTasks_ConversationDetailID_ProjectID, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJTasks_ConversationDetailID_ConversationDetailID, p_UserID => p_MJTasks_ConversationDetailID_UserID, p_AgentID => p_MJTasks_ConversationDetailID_AgentID, p_Status => p_MJTasks_ConversationDetailID_Status, p_PercentComplete => p_MJTasks_ConversationDetailID_PercentComplete, p_DueAt => p_MJTasks_ConversationDetailID_DueAt, p_StartedAt => p_MJTasks_ConversationDetailID_StartedAt, p_CompletedAt => p_MJTasks_ConversationDetailID_CompletedAt);

    END LOOP;

    

    DELETE FROM
        __mj."ConversationDetail"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCredentialType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCredentialType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CredentialType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCredentialCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCredentialCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CredentialCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCountry'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCountry"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Country"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboardCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DashboardCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteCredential'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteCredential"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Credential"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboardUserPreference'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardUserPreference"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DashboardUserPreference"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboardCategoryLink'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardCategoryLink"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DashboardCategoryLink"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboardPartType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardPartType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DashboardPartType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboardPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DashboardPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboardCategoryPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardCategoryPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DashboardCategoryPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDataContextItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDataContextItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DataContextItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboard'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboard"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJDashboardCategoryLinks_DashboardIDID UUID;
    p_MJDashboardPermissions_DashboardIDID UUID;
    p_MJDashboardUserPreferences_DashboardIDID UUID;
    p_MJDashboardUserStates_DashboardIDID UUID;
BEGIN
-- Cascade delete from DashboardCategoryLink using cursor to call spDeleteDashboardCategoryLink

    FOR _rec IN SELECT "ID" FROM __mj."DashboardCategoryLink" WHERE "DashboardID" = p_ID
    LOOP
        p_MJDashboardCategoryLinks_DashboardIDID := _rec."ID";
        PERFORM __mj."spDeleteDashboardCategoryLink"(p_ID => p_MJDashboardCategoryLinks_DashboardIDID);
        
    END LOOP;
    
    
    -- Cascade delete from DashboardPermission using cursor to call spDeleteDashboardPermission

    FOR _rec IN SELECT "ID" FROM __mj."DashboardPermission" WHERE "DashboardID" = p_ID
    LOOP
        p_MJDashboardPermissions_DashboardIDID := _rec."ID";
        PERFORM __mj."spDeleteDashboardPermission"(p_ID => p_MJDashboardPermissions_DashboardIDID);
        
    END LOOP;
    
    
    -- Cascade delete from DashboardUserPreference using cursor to call spDeleteDashboardUserPreference

    FOR _rec IN SELECT "ID" FROM __mj."DashboardUserPreference" WHERE "DashboardID" = p_ID
    LOOP
        p_MJDashboardUserPreferences_DashboardIDID := _rec."ID";
        PERFORM __mj."spDeleteDashboardUserPreference"(p_ID => p_MJDashboardUserPreferences_DashboardIDID);
        
    END LOOP;
    
    
    -- Cascade delete from DashboardUserState using cursor to call spDeleteDashboardUserState

    FOR _rec IN SELECT "ID" FROM __mj."DashboardUserState" WHERE "DashboardID" = p_ID
    LOOP
        p_MJDashboardUserStates_DashboardIDID := _rec."ID";
        PERFORM __mj."spDeleteDashboardUserState"(p_ID => p_MJDashboardUserStates_DashboardIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Dashboard"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDashboardUserState'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardUserState"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DashboardUserState"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDataContext'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDataContext"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DataContext"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDatasetItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDatasetItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DatasetItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDuplicateRunDetailMatch'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRunDetailMatch"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRunDetailMatch"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEmployeeCompanyIntegration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEmployeeCompanyIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EmployeeCompanyIntegration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDuplicateRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDataset'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDataset"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Dataset"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteDuplicateRunDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."DuplicateRunDetail"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEmployee'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEmployee"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Employee"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEmployeeSkill'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEmployeeSkill"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EmployeeSkill"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEmployeeRole'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEmployeeRole"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EmployeeRole"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEncryptionAlgorithm'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEncryptionAlgorithm"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EncryptionAlgorithm"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEncryptionKeySource'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEncryptionKeySource"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EncryptionKeySource"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityActionInvocationType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionInvocationType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityActionInvocationType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEncryptionKey'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEncryptionKey"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EncryptionKey"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityActionFilter'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionFilter"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityActionFilter"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityActionInvocation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionInvocation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityActionInvocation"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityActionParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityActionParam"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityAIAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityAIAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityAIAction"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityAction"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityCommunicationField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityCommunicationField"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityCommunicationField"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityCommunicationMessageType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityCommunicationMessageType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityCommunicationMessageType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityFieldValue'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityFieldValue"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityFieldValue"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityDocument'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityDocumentType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocumentType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityDocumentType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityDocumentSetting'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocumentSetting"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityDocumentSetting"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityDocumentRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocumentRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityDocumentRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityOrganicKey'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityOrganicKey"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityOrganicKey"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityRecordDocument'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityRecordDocument"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityRecordDocument"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityOrganicKeyRelatedEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityOrganicKeyRelatedEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityOrganicKeyRelatedEntity"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityRelationship'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityRelationship"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityRelationship"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityRelationshipDisplayComponent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityRelationshipDisplayComponent"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityRelationshipDisplayComponent"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteErrorLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteErrorLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ErrorLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEnvironment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEnvironment"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Environment"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntitySetting'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntitySetting"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntitySetting"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteFileCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteFileCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."FileCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteFileStorageAccount'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteFileStorageAccount"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."FileStorageAccount"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteExplorerNavigationItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteExplorerNavigationItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ExplorerNavigationItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteFileStorageAccountPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteFileStorageAccountPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."FileStorageAccountPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteFileEntityRecordLink'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteFileEntityRecordLink"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."FileEntityRecordLink"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteGeneratedCode'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteGeneratedCode"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."GeneratedCode"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteGeneratedCodeCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteGeneratedCodeCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."GeneratedCodeCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteFileStorageProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteFileStorageProvider"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."FileStorageProvider"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteFile'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteFile"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."File"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteInstanceConfiguration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteInstanceConfiguration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."InstanceConfiguration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIntegrationURLFormat'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationURLFormat"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationURLFormat"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIntegration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Integration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIntegrationSourceType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationSourceType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationSourceType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIntegrationObject'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteIntegrationObjectField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteKnowledgeHubSavedSearch'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteKnowledgeHubSavedSearch"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."KnowledgeHubSavedSearch"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteLibraryItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteLibraryItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."LibraryItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteLibrary'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteLibrary"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Library"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteListCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteListCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ListCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteListDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteListDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ListDetail"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteListInvitation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteListInvitation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ListInvitation"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMCPServerConnectionTool'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerConnectionTool"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPServerConnectionTool"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteList'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteList"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."List"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteListShare'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteListShare"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ListShare"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMCPServerConnectionPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerConnectionPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPServerConnectionPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMCPServer'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServer"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPServer"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMCPServerConnection'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerConnection"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPServerConnection"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMCPServerTool'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerTool"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPServerTool"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMCPToolExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMCPToolExecutionLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPToolExecutionLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteMCPToolFavorite'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteMCPToolFavorite"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."MCPToolFavorite"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOpenAppDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOpenAppDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OpenAppDependency"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOAuthAuthorizationState'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthAuthorizationState"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OAuthAuthorizationState"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOAuthClientRegistration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthClientRegistration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OAuthClientRegistration"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOAuthAuthServerMetadataCache'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthAuthServerMetadataCache"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OAuthAuthServerMetadataCache"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOAuthToken'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthToken"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OAuthToken"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOpenAppInstallHistory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOpenAppInstallHistory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OpenAppInstallHistory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOutputDeliveryType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOutputDeliveryType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OutputDeliveryType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOutputFormatType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOutputFormatType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OutputFormatType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOutputTriggerType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOutputTriggerType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OutputTriggerType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteOpenApp'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteOpenApp"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."OpenApp"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeletePublicLink'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeletePublicLink"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."PublicLink"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeletePermissionDomain'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeletePermissionDomain"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."PermissionDomain"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteProject'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteProject"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Project"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueryCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueryCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueryCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQuery'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQuery"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJDataContextItems_QueryIDID UUID;
    p_MJDataContextItems_QueryID_DataContextID UUID;
    p_MJDataContextItems_QueryID_Type VARCHAR(50);
    p_MJDataContextItems_QueryID_ViewID UUID;
    p_MJDataContextItems_QueryID_QueryID UUID;
    p_MJDataContextItems_QueryID_EntityID UUID;
    p_MJDataContextItems_QueryID_RecordID VARCHAR(450);
    p_MJDataContextItems_QueryID_SQL TEXT;
    p_MJDataContextItems_QueryID_DataJSON TEXT;
    p_MJDataContextItems_QueryID_LastRefreshedAt TIMESTAMPTZ;
    p_MJDataContextItems_QueryID_Description TEXT;
    p_MJDataContextItems_QueryID_CodeName VARCHAR(255);
    p_MJQueryDependencies_QueryIDID UUID;
    p_MJQueryDependencies_DependsOnQueryIDID UUID;
    p_MJQueryEntities_QueryIDID UUID;
    p_MJQueryFields_QueryIDID UUID;
    p_MJQueryParameters_QueryIDID UUID;
    p_MJQueryPermissions_QueryIDID UUID;
    p_MJQuerySQLs_QueryIDID UUID;
BEGIN
-- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem


    FOR _rec IN SELECT "ID", "DataContextID", "Type", "ViewID", "QueryID", "EntityID", "RecordID", "SQL", "DataJSON", "LastRefreshedAt", "Description", "CodeName" FROM __mj."DataContextItem" WHERE "QueryID" = p_ID
    LOOP
        p_MJDataContextItems_QueryIDID := _rec."ID";
        p_MJDataContextItems_QueryID_DataContextID := _rec."DataContextID";
        p_MJDataContextItems_QueryID_Type := _rec."Type";
        p_MJDataContextItems_QueryID_ViewID := _rec."ViewID";
        p_MJDataContextItems_QueryID_QueryID := _rec."QueryID";
        p_MJDataContextItems_QueryID_EntityID := _rec."EntityID";
        p_MJDataContextItems_QueryID_RecordID := _rec."RecordID";
        p_MJDataContextItems_QueryID_SQL := _rec."SQL";
        p_MJDataContextItems_QueryID_DataJSON := _rec."DataJSON";
        p_MJDataContextItems_QueryID_LastRefreshedAt := _rec."LastRefreshedAt";
        p_MJDataContextItems_QueryID_Description := _rec."Description";
        p_MJDataContextItems_QueryID_CodeName := _rec."CodeName";
        -- Set the FK field to NULL
        p_MJDataContextItems_QueryID_QueryID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateDataContextItem"(p_ID => p_MJDataContextItems_QueryIDID, p_DataContextID => p_MJDataContextItems_QueryID_DataContextID, p_Type => p_MJDataContextItems_QueryID_Type, p_ViewID => p_MJDataContextItems_QueryID_ViewID, p_QueryID_Clear => 1, p_QueryID => p_MJDataContextItems_QueryID_QueryID, p_EntityID => p_MJDataContextItems_QueryID_EntityID, p_RecordID => p_MJDataContextItems_QueryID_RecordID, p_SQL => p_MJDataContextItems_QueryID_SQL, p_DataJSON => p_MJDataContextItems_QueryID_DataJSON, p_LastRefreshedAt => p_MJDataContextItems_QueryID_LastRefreshedAt, p_Description => p_MJDataContextItems_QueryID_Description, p_CodeName => p_MJDataContextItems_QueryID_CodeName);

    END LOOP;

    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency

    FOR _rec IN SELECT "ID" FROM __mj."QueryDependency" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryDependencies_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryDependency"(p_ID => p_MJQueryDependencies_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency

    FOR _rec IN SELECT "ID" FROM __mj."QueryDependency" WHERE "DependsOnQueryID" = p_ID
    LOOP
        p_MJQueryDependencies_DependsOnQueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryDependency"(p_ID => p_MJQueryDependencies_DependsOnQueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity

    FOR _rec IN SELECT "ID" FROM __mj."QueryEntity" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryEntities_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryEntity"(p_ID => p_MJQueryEntities_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField

    FOR _rec IN SELECT "ID" FROM __mj."QueryField" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryFields_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryField"(p_ID => p_MJQueryFields_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter

    FOR _rec IN SELECT "ID" FROM __mj."QueryParameter" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryParameters_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryParameter"(p_ID => p_MJQueryParameters_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission

    FOR _rec IN SELECT "ID" FROM __mj."QueryPermission" WHERE "QueryID" = p_ID
    LOOP
        p_MJQueryPermissions_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQueryPermission"(p_ID => p_MJQueryPermissions_QueryIDID);
        
    END LOOP;
    
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL

    FOR _rec IN SELECT "ID" FROM __mj."QuerySQL" WHERE "QueryID" = p_ID
    LOOP
        p_MJQuerySQLs_QueryIDID := _rec."ID";
        PERFORM __mj."spDeleteQuerySQL"(p_ID => p_MJQuerySQLs_QueryIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Query"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueryParameter'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueryParameter"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueryParameter"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueryField'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueryField"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueryField"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueryDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueryDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueryDependency"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueryPermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueryPermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueryPermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueryEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueryEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueryEntity"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueueType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueueType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueueType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueueTask'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueueTask"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QueueTask"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecommendationItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendationItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecommendationItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQuerySQL'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQuerySQL"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."QuerySQL"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteQueue'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteQueue"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Queue"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecommendationRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendationRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecommendationRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecordChange'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecordChange"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordChange"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecommendationProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendationProvider"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecommendationProvider"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecordChangeReplayRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecordChangeReplayRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordChangeReplayRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecommendation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Recommendation"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecordMergeLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecordMergeLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordMergeLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecordLink'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecordLink"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordLink"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteReportCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteReportCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ReportCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecordMergeDeletionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecordMergeDeletionLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordMergeDeletionLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRecordGeoCode'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRecordGeoCode"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RecordGeoCode"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteResourceLink'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteResourceLink"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ResourceLink"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteReportSnapshot'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteReportSnapshot"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ReportSnapshot"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteReportVersion'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteReportVersion"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ReportVersion"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteReport'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteReport"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJReportSnapshots_ReportIDID UUID;
    p_MJReportUserStates_ReportIDID UUID;
    p_MJReportVersions_ReportIDID UUID;
BEGIN
-- Cascade delete from ReportSnapshot using cursor to call spDeleteReportSnapshot

    FOR _rec IN SELECT "ID" FROM __mj."ReportSnapshot" WHERE "ReportID" = p_ID
    LOOP
        p_MJReportSnapshots_ReportIDID := _rec."ID";
        PERFORM __mj."spDeleteReportSnapshot"(p_ID => p_MJReportSnapshots_ReportIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ReportUserState using cursor to call spDeleteReportUserState

    FOR _rec IN SELECT "ID" FROM __mj."ReportUserState" WHERE "ReportID" = p_ID
    LOOP
        p_MJReportUserStates_ReportIDID := _rec."ID";
        PERFORM __mj."spDeleteReportUserState"(p_ID => p_MJReportUserStates_ReportIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ReportVersion using cursor to call spDeleteReportVersion

    FOR _rec IN SELECT "ID" FROM __mj."ReportVersion" WHERE "ReportID" = p_ID
    LOOP
        p_MJReportVersions_ReportIDID := _rec."ID";
        PERFORM __mj."spDeleteReportVersion"(p_ID => p_MJReportVersions_ReportIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Report"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteReportUserState'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteReportUserState"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ReportUserState"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRole'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRole"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Role"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteResourceType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteResourceType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ResourceType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteRowLevelSecurityFilter'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteRowLevelSecurityFilter"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."RowLevelSecurityFilter"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteScheduledActionParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledActionParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ScheduledActionParam"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteResourcePermission'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteResourcePermission"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ResourcePermission"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteScheduledAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ScheduledAction"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteScheduledJobType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJobType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ScheduledJobType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteScheduledJob'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJob"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ScheduledJob"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSchemaInfo'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSchemaInfo"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SchemaInfo"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteScheduledJobRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJobRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ScheduledJobRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteStateProvince'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteStateProvince"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."StateProvince"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSQLDialect'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSQLDialect"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SQLDialect"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSearchProvider'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSearchProvider"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."SearchProvider"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteSkill'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteSkill"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Skill"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTagAuditLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTagAuditLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagAuditLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTagSynonym'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTagSynonym"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagSynonym"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTagCoOccurrence'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTagCoOccurrence"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagCoOccurrence"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTagSuggestion'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTagSuggestion"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagSuggestion"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTaggedItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTaggedItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TaggedItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTagScope'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTagScope"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TagScope"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTag'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTag"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Tag"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTemplateCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TemplateCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTaskDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTaskDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TaskDependency"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTaskType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTaskType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TaskType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTask'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTask"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Task"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTemplateParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TemplateParam"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTemplateContent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateContent"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TemplateContent"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTemplateContentType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateContentType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TemplateContentType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTemplate'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTemplate"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Template"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestRubric'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestRubric"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestRubric"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestRunFeedback'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestRunFeedback"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestRunFeedback"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestRunOutputType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestRunOutputType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestRunOutputType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestSuiteRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestSuiteRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestSuiteRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestRunOutput'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestRunOutput"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestRunOutput"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserApplicationEntity'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserApplicationEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserApplicationEntity"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestSuiteTest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestSuiteTest"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestSuiteTest"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTest"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Test"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTestSuite'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTestSuite"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TestSuite"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserFavorite'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserFavorite"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserFavorite"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserNotificationPreference'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserNotificationPreference"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserNotificationPreference"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserNotificationType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserNotificationType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserNotificationType"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserNotification'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserNotification"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserNotification"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserApplication'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserApplication"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserApplication"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserRecordLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserRecordLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserRecordLog"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserViewRunDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserViewRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserViewRunDetail"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserRole'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserRole"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserRole"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserSetting'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserSetting"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserSetting"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserViewCategory'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserViewCategory"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserViewCategory"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserView'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserView"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserView"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUser'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUser"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."User"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteUserViewRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteUserViewRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."UserViewRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteVectorDatabase'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteVectorIndex'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteVersionInstallation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteVersionInstallation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VersionInstallation"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteVersionLabelItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteVersionLabelItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VersionLabelItem"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteVersionLabel'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteVersionLabel"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VersionLabel"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteWorkflowEngine'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteWorkflowEngine"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."WorkflowEngine"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteVersionLabelRestore'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteVersionLabelRestore"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VersionLabelRestore"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteWorkflowRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteWorkflowRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."WorkflowRun"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteWorkflow'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteWorkflow"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Workflow"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteWorkspace'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteWorkspace"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Workspace"
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

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteWorkspaceItem'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteWorkspaceItem"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."WorkspaceItem"
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


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionContext" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Contexts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionContext" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Access Control Rules */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Access Control Rules
-- Item: spDeleteAccessControlRule
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AccessControlRule
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAccessControlRule" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Access Control Rules */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAccessControlRule" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Authorizations
-- Item: spDeleteActionAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionAuthorization
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionAuthorization" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Authorizations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionAuthorization" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Categories
-- Item: spDeleteActionCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Context Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Context Types
-- Item: spDeleteActionContextType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionContextType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionContextType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Context Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionContextType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Libraries
-- Item: spDeleteActionLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionLibrary
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Libraries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spDeleteActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Execution Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Filters
-- Item: spDeleteActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionFilter
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionFilter" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Filters */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionFilter" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Params
-- Item: spDeleteActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Result Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Result Codes
-- Item: spDeleteActionResultCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionResultCode
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionResultCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Result Codes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionResultCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Actions
-- Item: spDeleteAIAgentAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentAction
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Categories
-- Item: spDeleteAIAgentCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Actions
-- Item: spDeleteAIAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAction
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAction" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAction" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Artifact Types
-- Item: spDeleteAIAgentArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Artifact Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spDeleteAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentExample
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Examples */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Data Sources
-- Item: spDeleteAIAgentDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentDataSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentDataSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Data Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentDataSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Agent Learning Cycles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Learning Cycles
-- Item: spDeleteAIAgentLearningCycle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentLearningCycle
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentLearningCycle" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Learning Cycles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentLearningCycle" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Configurations
-- Item: spDeleteAIAgentConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Models
-- Item: spDeleteAIAgentModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentModel" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Models */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentModel" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Modalities
-- Item: spDeleteAIAgentModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentModality
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentModality" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Modalities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentModality" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Note Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Note Types
-- Item: spDeleteAIAgentNoteType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNoteType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNoteType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Note Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNoteType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Notes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Permissions
-- Item: spDeleteAIAgentPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spDeleteAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRelationship" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Relationships */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRelationship" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: spDeleteAIAgentPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentPrompt
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentPrompt" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Prompts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentPrompt" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spDeleteAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunMedia" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Run Medias */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunMedia" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Steps
-- Item: spDeleteAIAgentStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentStep
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentStep" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Steps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentStep" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spDeleteAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Step Paths */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Step Paths
-- Item: spDeleteAIAgentStepPath
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentStepPath
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentStepPath" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Step Paths */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentStepPath" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: spDeleteAIArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIArchitecture
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIArchitecture" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Architectures */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIArchitecture" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: spDeleteAIConfigurationParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfigurationParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfigurationParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Configuration Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfigurationParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Model Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Architectures
-- Item: spDeleteAIModelArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelArchitecture
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelArchitecture" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Architectures */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelArchitecture" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Credential Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Credential Bindings
-- Item: spDeleteAICredentialBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AICredentialBinding
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAICredentialBinding" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Credential Bindings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAICredentialBinding" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Costs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Costs
-- Item: spDeleteAIModelCost
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelCost
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelCost" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Costs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelCost" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Actions
-- Item: spDeleteAIModelAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelAction
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelAction" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelAction" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Modalities
-- Item: spDeleteAIModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModality
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModality" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Modalities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModality" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Price Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Types
-- Item: spDeleteAIModelPriceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelPriceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelPriceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Price Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelPriceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Price Unit Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Price Unit Types
-- Item: spDeleteAIModelPriceUnitType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelPriceUnitType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelPriceUnitType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Price Unit Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelPriceUnitType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Model Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Modalities
-- Item: spDeleteAIModelModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelModality
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelModality" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Modalities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelModality" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: spDeleteAIPromptRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRunMedia
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRunMedia" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompt Run Medias */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRunMedia" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompt Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Categories
-- Item: spDeleteAIPromptCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptCategory" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompt Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptCategory" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spDeleteAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompt Models */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompt Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompt Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Types
-- Item: spDeleteAIPromptType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompt Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Vendor Type Definitions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Type Definitions
-- Item: spDeleteAIVendorTypeDefinition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendorTypeDefinition
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIVendorTypeDefinition" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Vendor Type Definitions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIVendorTypeDefinition" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: spDeleteAIVendorType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendorType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIVendorType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Vendor Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIVendorType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Result Cache
-- Item: spDeleteAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIResultCache
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Key Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Applications
-- Item: spDeleteAPIKeyApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyApplication
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyApplication" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Key Applications */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyApplication" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Applications
-- Item: spDeleteAPIApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIApplication
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIApplication" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Applications */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIApplication" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendors
-- Item: spDeleteAIVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendor
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIVendor" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Vendors */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIVendor" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spDeleteAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIApplicationScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Application Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIApplicationScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spDeleteAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Key Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spDeleteApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Application Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Keys
-- Item: spDeleteAPIKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Keys */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: spDeleteAPIScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spDeleteAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyUsageLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: API Key Usage Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKeyUsageLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Application Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Roles
-- Item: spDeleteApplicationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationRole
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationRole" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Application Roles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationRole" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Application Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Settings
-- Item: spDeleteApplicationSetting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationSetting
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationSetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Application Settings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplicationSetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Configuration Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configuration Entities
-- Item: spDeleteArchiveConfigurationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveConfigurationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfigurationEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Configuration Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfigurationEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Applications */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spDeleteArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Configurations
-- Item: spDeleteArchiveConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Runs
-- Item: spDeleteArchiveRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Permissions
-- Item: spDeleteArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactPermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactPermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Version Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Version Attributes
-- Item: spDeleteArtifactVersionAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersionAttribute
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersionAttribute" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Version Attributes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersionAttribute" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Uses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Uses
-- Item: spDeleteArtifactUse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactUse
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactUse" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Uses */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactUse" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Versions
-- Item: spDeleteArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactVersion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Versions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Logs
-- Item: spDeleteAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AuditLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAuditLog" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Audit Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAuditLog" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifacts
-- Item: spDeleteArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Artifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifact" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifact" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Log Types
-- Item: spDeleteAuditLogType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AuditLogType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAuditLogType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Audit Log Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAuditLogType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Authorization Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorization Roles
-- Item: spDeleteAuthorizationRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AuthorizationRole
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAuthorizationRole" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Authorization Roles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAuthorizationRole" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Collection Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Artifacts
-- Item: spDeleteCollectionArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CollectionArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Collection Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollectionArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Collection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collection Permissions
-- Item: spDeleteCollectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CollectionPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollectionPermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Collection Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollectionPermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spDeleteCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Collection
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollection" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Collections */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCollection" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorizations
-- Item: spDeleteAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Authorization
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationBaseMessageType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Communication Base Message Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationBaseMessageType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Communication Provider Message Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Communication Provider Message Types
-- Item: spDeleteCommunicationProviderMessageType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationProviderMessageType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationProviderMessageType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Communication Provider Message Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationProviderMessageType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Communication Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Communication Providers
-- Item: spDeleteCommunicationProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Communication Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Communication Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Communication Logs
-- Item: spDeleteCommunicationLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Communication Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Companies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Companies
-- Item: spDeleteCompany
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Company
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompany" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Companies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompany" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Communication Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Communication Runs
-- Item: spDeleteCommunicationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Communication Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCommunicationRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Run Details
-- Item: spDeleteCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Record Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Record Maps
-- Item: spDeleteCompanyIntegrationRecordMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRecordMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRecordMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Record Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRecordMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Run API Logs
-- Item: spDeleteCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRunAPILog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Run API Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRunAPILog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Field Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spDeleteCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationEntityMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Entity Maps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationEntityMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: spDeleteCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spDeleteComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Component Libraries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Component Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Dependencies
-- Item: spDeleteComponentDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Component Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Sync Watermarks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Component Library Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Library Links
-- Item: spDeleteComponentLibraryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentLibraryLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentLibraryLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Component Library Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentLibraryLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spDeleteComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Component
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Components */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content File Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content File Types
-- Item: spDeleteContentFileType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentFileType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentFileType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content File Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentFileType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Component Registries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Registries
-- Item: spDeleteComponentRegistry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentRegistry
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentRegistry" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Component Registries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentRegistry" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Item Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Attributes
-- Item: spDeleteContentItemAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemAttribute
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemAttribute" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Item Attributes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemAttribute" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: spDeleteContentItemDuplicate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemDuplicate
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemDuplicate" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Item Duplicates */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemDuplicate" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spDeleteContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: spDeleteContentProcessRunPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRunPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunPromptRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Process Run Prompt Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunPromptRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spDeleteContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Process Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: spDeleteContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Process Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentProcessRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Source Type Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Type Params
-- Item: spDeleteContentSourceTypeParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSourceTypeParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceTypeParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Source Type Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceTypeParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spDeleteContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Source Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Source Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Params
-- Item: spDeleteContentSourceParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSourceParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Source Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSourceParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Permissions
-- Item: spDeleteConversationArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Artifact Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spDeleteContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Type Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Type Attributes
-- Item: spDeleteContentTypeAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentTypeAttribute
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentTypeAttribute" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Type Attributes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentTypeAttribute" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Artifact Versions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifact" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifact" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Attachments */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Ratings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Ratings
-- Item: spDeleteConversationDetailRating
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailRating
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailRating" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Ratings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailRating" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spDeleteConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Credential Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Types
-- Item: spDeleteCredentialType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CredentialType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCredentialType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Credential Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCredentialType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: spDeleteCredentialCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CredentialCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCredentialCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Credential Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCredentialCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Countries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Countries
-- Item: spDeleteCountry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Country
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCountry" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Countries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCountry" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboard Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Categories
-- Item: spDeleteDashboardCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardCategory" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboard Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardCategory" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Credentials */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credentials
-- Item: spDeleteCredential
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Credential
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCredential" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Credentials */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCredential" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboard User Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User Preferences
-- Item: spDeleteDashboardUserPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardUserPreference
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardUserPreference" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboard User Preferences */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardUserPreference" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboard Category Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Links
-- Item: spDeleteDashboardCategoryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardCategoryLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardCategoryLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboard Category Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardCategoryLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboard Part Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Part Types
-- Item: spDeleteDashboardPartType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardPartType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardPartType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboard Part Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardPartType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboard Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Permissions
-- Item: spDeleteDashboardPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardPermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboard Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardPermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboard Category Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Permissions
-- Item: spDeleteDashboardCategoryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardCategoryPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardCategoryPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboard Category Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardCategoryPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Data Context Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Data Context Items
-- Item: spDeleteDataContextItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DataContextItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDataContextItem" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Data Context Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDataContextItem" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboards
-- Item: spDeleteDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dashboard
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboard" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboards */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboard" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dashboard User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User States
-- Item: spDeleteDashboardUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardUserState
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardUserState" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dashboard User States */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDashboardUserState" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Data Contexts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Data Contexts
-- Item: spDeleteDataContext
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DataContext
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDataContext" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Data Contexts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDataContext" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Dataset Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dataset Items
-- Item: spDeleteDatasetItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DatasetItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDatasetItem" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Dataset Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDatasetItem" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: spDeleteDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetailMatch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Run Detail Matches */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetailMatch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Employee Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Employee Company Integrations
-- Item: spDeleteEmployeeCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EmployeeCompanyIntegration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployeeCompanyIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Employee Company Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployeeCompanyIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spDeleteDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Datasets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Datasets
-- Item: spDeleteDataset
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dataset
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDataset" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Datasets */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDataset" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spDeleteDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Duplicate Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteDuplicateRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Employees
-- Item: spDeleteEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Employee
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployee" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Employees */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployee" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Employee Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Employee Skills
-- Item: spDeleteEmployeeSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EmployeeSkill
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployeeSkill" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Employee Skills */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployeeSkill" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Employee Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Employee Roles
-- Item: spDeleteEmployeeRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EmployeeRole
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployeeRole" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Employee Roles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEmployeeRole" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: spDeleteEncryptionAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionAlgorithm
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEncryptionAlgorithm" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Encryption Algorithms */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEncryptionAlgorithm" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: spDeleteEncryptionKeySource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionKeySource
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEncryptionKeySource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Encryption Key Sources */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEncryptionKeySource" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Action Invocation Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocation Types
-- Item: spDeleteEntityActionInvocationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionInvocationType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocationType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Action Invocation Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocationType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: spDeleteEncryptionKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEncryptionKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Encryption Keys */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEncryptionKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spDeleteEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionFilter" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Action Filters */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionFilter" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spDeleteEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Action Invocations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spDeleteEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Action Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity AI Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity AI Actions
-- Item: spDeleteEntityAIAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityAIAction
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityAIAction" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity AI Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityAIAction" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Actions
-- Item: spDeleteEntityAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityAction
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Communication Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Communication Fields
-- Item: spDeleteEntityCommunicationField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityCommunicationField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityCommunicationField" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Communication Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityCommunicationField" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Communication Message Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Communication Message Types
-- Item: spDeleteEntityCommunicationMessageType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityCommunicationMessageType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityCommunicationMessageType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Communication Message Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityCommunicationMessageType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spDeleteEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Document Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Document Types
-- Item: spDeleteEntityDocumentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocumentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocumentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Document Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocumentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Document Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Document Settings
-- Item: spDeleteEntityDocumentSetting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocumentSetting
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocumentSetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Document Settings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocumentSetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Document Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Document Runs
-- Item: spDeleteEntityDocumentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocumentRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocumentRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Document Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocumentRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: Entity Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Permissions
-- Item: spDeleteEntityPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityPermission" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Organic Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Keys
-- Item: spDeleteEntityOrganicKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityOrganicKey
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Organic Keys */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKey" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Record Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Record Documents
-- Item: spDeleteEntityRecordDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRecordDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRecordDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Record Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRecordDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Organic Key Related Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Organic Key Related Entities
-- Item: spDeleteEntityOrganicKeyRelatedEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityOrganicKeyRelatedEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKeyRelatedEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Organic Key Related Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityOrganicKeyRelatedEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Relationships */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRelationship" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Relationship Display Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationship Display Components
-- Item: spDeleteEntityRelationshipDisplayComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationshipDisplayComponent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRelationshipDisplayComponent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Relationship Display Components */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityRelationshipDisplayComponent" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Error Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Error Logs
-- Item: spDeleteErrorLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ErrorLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteErrorLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Error Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteErrorLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Environments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Environments
-- Item: spDeleteEnvironment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Environment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEnvironment" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Environments */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEnvironment" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Settings
-- Item: spDeleteEntitySetting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntitySetting
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntitySetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Settings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntitySetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: File Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Categories
-- Item: spDeleteFileCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileCategory" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: File Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileCategory" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: spDeleteFileStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageAccount
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccount" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: File Storage Accounts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccount" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Explorer Navigation Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Explorer Navigation Items
-- Item: spDeleteExplorerNavigationItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExplorerNavigationItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteExplorerNavigationItem" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Explorer Navigation Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteExplorerNavigationItem" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: spDeleteFileStorageAccountPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageAccountPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccountPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: File Storage Account Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageAccountPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: File Entity Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Entity Record Links
-- Item: spDeleteFileEntityRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileEntityRecordLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileEntityRecordLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: File Entity Record Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileEntityRecordLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Generated Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Generated Codes
-- Item: spDeleteGeneratedCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeneratedCode
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteGeneratedCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Generated Codes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteGeneratedCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Generated Code Categories
-- Item: spDeleteGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteGeneratedCodeCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Generated Code Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteGeneratedCodeCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Providers
-- Item: spDeleteFileStorageProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageProvider" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: File Storage Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFileStorageProvider" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Files
-- Item: spDeleteFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR File
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFile" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Files */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteFile" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: spDeleteInstanceConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InstanceConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteInstanceConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Instance Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteInstanceConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration URL Formats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration URL Formats
-- Item: spDeleteIntegrationURLFormat
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationURLFormat
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationURLFormat" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration URL Formats */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationURLFormat" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spDeleteIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Integration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spDeleteIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration Source Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: spDeleteKnowledgeHubSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR KnowledgeHubSavedSearch
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteKnowledgeHubSavedSearch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Knowledge Hub Saved Searches */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteKnowledgeHubSavedSearch" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Library Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Library Items
-- Item: spDeleteLibraryItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR LibraryItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteLibraryItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Library Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteLibraryItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Libraries
-- Item: spDeleteLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Library
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Libraries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Categories
-- Item: spDeleteListCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: List Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: List Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Details
-- Item: spDeleteListDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListDetail" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: List Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListDetail" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: List Invitations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Invitations
-- Item: spDeleteListInvitation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListInvitation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListInvitation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: List Invitations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListInvitation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Server Connection Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Tools
-- Item: spDeleteMCPServerConnectionTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerConnectionTool
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerConnectionTool" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Server Connection Tools */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerConnectionTool" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Lists
-- Item: spDeleteList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR List
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Lists */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteList" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: List Shares */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Shares
-- Item: spDeleteListShare
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListShare
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListShare" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: List Shares */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteListShare" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Server Connection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Permissions
-- Item: spDeleteMCPServerConnectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerConnectionPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerConnectionPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Server Connection Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerConnectionPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: spDeleteMCPServer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServer
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServer" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Servers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServer" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Server Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connections
-- Item: spDeleteMCPServerConnection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerConnection
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerConnection" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Server Connections */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerConnection" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Server Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Tools
-- Item: spDeleteMCPServerTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerTool
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerTool" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Server Tools */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPServerTool" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: spDeleteMCPToolExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPToolExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPToolExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Tool Execution Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPToolExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: MCP Tool Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Favorites
-- Item: spDeleteMCPToolFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPToolFavorite
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPToolFavorite" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: MCP Tool Favorites */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteMCPToolFavorite" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Open App Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Dependencies
-- Item: spDeleteOpenAppDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Open App Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: O Auth Authorization States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Authorization States
-- Item: spDeleteOAuthAuthorizationState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthAuthorizationState
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthAuthorizationState" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: O Auth Authorization States */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthAuthorizationState" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: O Auth Client Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Client Registrations
-- Item: spDeleteOAuthClientRegistration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthClientRegistration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthClientRegistration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: O Auth Client Registrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthClientRegistration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: O Auth Auth Server Metadata Caches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Auth Server Metadata Caches
-- Item: spDeleteOAuthAuthServerMetadataCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthAuthServerMetadataCache
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthAuthServerMetadataCache" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: O Auth Auth Server Metadata Caches */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthAuthServerMetadataCache" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: O Auth Tokens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: O Auth Tokens
-- Item: spDeleteOAuthToken
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OAuthToken
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthToken" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: O Auth Tokens */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOAuthToken" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Open App Install Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open App Install Histories
-- Item: spDeleteOpenAppInstallHistory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenAppInstallHistory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppInstallHistory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Open App Install Histories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenAppInstallHistory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Output Delivery Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Output Delivery Types
-- Item: spDeleteOutputDeliveryType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OutputDeliveryType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOutputDeliveryType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Output Delivery Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOutputDeliveryType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Output Format Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Output Format Types
-- Item: spDeleteOutputFormatType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OutputFormatType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOutputFormatType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Output Format Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOutputFormatType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Output Trigger Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Output Trigger Types
-- Item: spDeleteOutputTriggerType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OutputTriggerType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOutputTriggerType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Output Trigger Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOutputTriggerType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Open Apps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OpenApp
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenApp" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Open Apps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteOpenApp" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Public Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Public Links
-- Item: spDeletePublicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PublicLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeletePublicLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Public Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeletePublicLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spDeletePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PermissionDomain
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeletePermissionDomain" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Permission Domains */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeletePermissionDomain" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spDeleteProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Project
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteProject" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Projects */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteProject" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Categories
-- Item: spDeleteQueryCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryCategory" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryCategory" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Queries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuery" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query Parameters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Parameters
-- Item: spDeleteQueryParameter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryParameter
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryParameter" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query Parameters */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryParameter" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Fields
-- Item: spDeleteQueryField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryField" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryField" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Dependencies
-- Item: spDeleteQueryDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Permissions
-- Item: spDeleteQueryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryPermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryPermission" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Entities
-- Item: spDeleteQueryEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueryEntity" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Queue Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queue Types
-- Item: spDeleteQueueType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueueType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueueType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Queue Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQueueType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queue Tasks
-- Item: spDeleteQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueueTask
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendationItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Recommendation Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendationItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Query SQLs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query SQLs
-- Item: spDeleteQuerySQL
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QuerySQL
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuerySQL" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Query SQLs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteQuerySQL" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Queues */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queues
-- Item: spDeleteQueue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Queue
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendationRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Recommendation Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendationRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: spDeleteRecordChange
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordChange
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendationProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Recommendation Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendationProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Change Replay Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Change Replay Runs
-- Item: spDeleteRecordChangeReplayRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordChangeReplayRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordChangeReplayRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Record Change Replay Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordChangeReplayRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Recommendations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Recommendations
-- Item: spDeleteRecommendation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Recommendation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Recommendations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecommendation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Merge Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Merge Logs
-- Item: spDeleteRecordMergeLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordMergeLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordMergeLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Record Merge Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordMergeLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Links
-- Item: spDeleteRecordLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Record Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Report Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Categories
-- Item: spDeleteReportCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportCategory" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Report Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportCategory" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Merge Deletion Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Merge Deletion Logs
-- Item: spDeleteRecordMergeDeletionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordMergeDeletionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordMergeDeletionLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Record Merge Deletion Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordMergeDeletionLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Record Geo Codes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Geo Codes
-- Item: spDeleteRecordGeoCode
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordGeoCode
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordGeoCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Record Geo Codes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordGeoCode" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Resource Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Links
-- Item: spDeleteResourceLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ResourceLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourceLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Resource Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourceLink" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Report Snapshots */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Snapshots
-- Item: spDeleteReportSnapshot
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportSnapshot
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportSnapshot" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Report Snapshots */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportSnapshot" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Report Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Versions
-- Item: spDeleteReportVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportVersion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Report Versions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportVersion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Reports
-- Item: spDeleteReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Report
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Reports */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Report User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report User States
-- Item: spDeleteReportUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportUserState
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportUserState" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Report User States */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReportUserState" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Roles
-- Item: spDeleteRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Role
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Roles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Resource Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Types
-- Item: spDeleteResourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ResourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourceType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Resource Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourceType" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Row Level Security Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Row Level Security Filters
-- Item: spDeleteRowLevelSecurityFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RowLevelSecurityFilter
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledActionParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Scheduled Action Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledActionParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Resource Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Resource Permissions
-- Item: spDeleteResourcePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ResourcePermission
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourcePermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Resource Permissions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteResourcePermission" TO "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Scheduled Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Actions
-- Item: spDeleteScheduledAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledAction
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Scheduled Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Scheduled Job Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Types
-- Item: spDeleteScheduledJobType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJobType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJobType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Scheduled Job Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJobType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spDeleteScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJob
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJob" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Scheduled Jobs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJob" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Schema Info */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Schema Info
-- Item: spDeleteSchemaInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SchemaInfo
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSchemaInfo" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Schema Info */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSchemaInfo" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: spDeleteScheduledJobRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJobRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJobRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Scheduled Job Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJobRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: State Provinces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: State Provinces
-- Item: spDeleteStateProvince
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR StateProvince
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteStateProvince" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: State Provinces */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteStateProvince" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: SQL Dialects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: SQL Dialects
-- Item: spDeleteSQLDialect
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SQLDialect
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSQLDialect" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: SQL Dialects */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSQLDialect" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: spDeleteSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchProvider
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Search Providers */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSearchProvider" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Skills
-- Item: spDeleteSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Skill
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSkill" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Skills */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteSkill" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: spDeleteTagAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagAuditLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagAuditLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Audit Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagAuditLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: spDeleteTagSynonym
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagSynonym
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSynonym" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Synonyms */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSynonym" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: spDeleteTagCoOccurrence
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagCoOccurrence
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagCoOccurrence" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Co Occurrences */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagCoOccurrence" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: spDeleteTagSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagSuggestion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSuggestion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Suggestions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagSuggestion" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spDeleteTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaggedItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tagged Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaggedItem" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: spDeleteTagScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagScope
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tag Scopes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTagScope" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spDeleteTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tags */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTag" TO "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Template Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Categories
-- Item: spDeleteTemplateCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TemplateCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Template Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateCategory" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spDeleteTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Task Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskDependency" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Task Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Types
-- Item: spDeleteTaskType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Task Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spDeleteTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Task
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTask" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tasks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTask" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Template Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Params
-- Item: spDeleteTemplateParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TemplateParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Template Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateParam" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Template Contents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Contents
-- Item: spDeleteTemplateContent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TemplateContent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateContent" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Template Contents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateContent" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Template Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Content Types
-- Item: spDeleteTemplateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TemplateContentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Template Content Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplateContentType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Templates
-- Item: spDeleteTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Template
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplate" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Templates */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTemplate" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Rubrics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Rubrics
-- Item: spDeleteTestRubric
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRubric
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRubric" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Rubrics */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRubric" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Run Feedbacks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Feedbacks
-- Item: spDeleteTestRunFeedback
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunFeedback
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunFeedback" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Run Feedbacks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunFeedback" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Run Output Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Output Types
-- Item: spDeleteTestRunOutputType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunOutputType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutputType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Run Output Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutputType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Suite Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Runs
-- Item: spDeleteTestSuiteRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuiteRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestSuiteRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Suite Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestSuiteRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spDeleteTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRunOutput
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutput" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Run Outputs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRunOutput" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spDeleteTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestRun" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Application Entities
-- Item: spDeleteUserApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserApplicationEntity
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Application Entities */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserApplicationEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Suite Tests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suite Tests
-- Item: spDeleteTestSuiteTest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuiteTest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestSuiteTest" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Suite Tests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestSuiteTest" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tests
-- Item: spDeleteTest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Test
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTest" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTest" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Types
-- Item: spDeleteTestType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: spDeleteTestSuite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuite
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestSuite" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Test Suites */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTestSuite" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Favorites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Favorites
-- Item: spDeleteUserFavorite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserFavorite
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserFavorite" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Favorites */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserFavorite" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: spDeleteUserNotificationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotificationPreference
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserNotificationPreference" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Notification Preferences */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserNotificationPreference" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: spDeleteUserNotificationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotificationType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserNotificationType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Notification Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserNotificationType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notifications
-- Item: spDeleteUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotification
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserApplication" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Applications */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserApplication" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Record Logs
-- Item: spDeleteUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRecordLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRecordLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Record Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRecordLog" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: spDeleteUserViewRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User View Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Roles
-- Item: spDeleteUserRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRole
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Roles */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRole" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Settings
-- Item: spDeleteUserSetting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserSetting
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserSetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Settings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserSetting" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Categories
-- Item: spDeleteUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewCategory
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewCategory" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User View Categories */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewCategory" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Views
-- Item: spDeleteUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserView
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserView" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User Views */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserView" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Users
-- Item: spDeleteUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR User
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUser" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Users */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUser" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: User View Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Runs
-- Item: spDeleteUserViewRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: User View Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Installations
-- Item: spDeleteVersionInstallation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionInstallation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionInstallation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Version Installations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionInstallation" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Version Label Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Items
-- Item: spDeleteVersionLabelItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabelItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabelItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Version Label Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabelItem" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: spDeleteVersionLabel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabel" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Version Labels */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabel" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Workflow Engines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Workflow Engines
-- Item: spDeleteWorkflowEngine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkflowEngine
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkflowEngine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Workflow Engines */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkflowEngine" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Version Label Restores */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Label Restores
-- Item: spDeleteVersionLabelRestore
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabelRestore
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabelRestore" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Version Label Restores */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionLabelRestore" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Workflow Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Workflow Runs
-- Item: spDeleteWorkflowRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkflowRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkflowRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Workflow Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkflowRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Workflows */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Workflows
-- Item: spDeleteWorkflow
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Workflow
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkflow" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Workflows */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkflow" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Workspaces */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Workspaces
-- Item: spDeleteWorkspace
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Workspace
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkspace" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Workspaces */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkspace" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Workspace Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Workspace Items
-- Item: spDeleteWorkspaceItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkspaceItem
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkspaceItem" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Workspace Items */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteWorkspaceItem" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;