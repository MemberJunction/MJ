-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================


-- ===================== Stored Procedures (sp*) =====================

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
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteActionAuthorization"(p_MJActionAuthorizations_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionContext using cursor to call spDeleteActionContext

    FOR _rec IN SELECT "ID" FROM __mj."ActionContext" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionContexts_ActionIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteActionContext"(p_MJActionContexts_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionExecutionLog using cursor to call spDeleteActionExecutionLog

    FOR _rec IN SELECT "ID" FROM __mj."ActionExecutionLog" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionExecutionLogs_ActionIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteActionExecutionLog"(p_MJActionExecutionLogs_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionLibrary using cursor to call spDeleteActionLibrary

    FOR _rec IN SELECT "ID" FROM __mj."ActionLibrary" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionLibraries_ActionIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteActionLibrary"(p_MJActionLibraries_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionParam using cursor to call spDeleteActionParam

    FOR _rec IN SELECT "ID" FROM __mj."ActionParam" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionParams_ActionIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteActionParam"(p_MJActionParams_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionResultCode using cursor to call spDeleteActionResultCode

    FOR _rec IN SELECT "ID" FROM __mj."ActionResultCode" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionResultCodes_ActionIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteActionResultCode"(p_MJActionResultCodes_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from Action using cursor to call spDeleteAction

    FOR _rec IN SELECT "ID" FROM __mj."Action" WHERE "ParentID" = p_ID
    LOOP
        p_MJActions_ParentIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteAction"(p_MJActions_ParentIDID);
        
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
        PERFORM __mj."spUpdateAIAgentAction"(p_MJAIAgentActions_ActionIDID, p_MJAIAgentActions_ActionID_AgentID, p_MJAIAgentActions_ActionID_ActionID, p_MJAIAgentActions_ActionID_Status, p_MJAIAgentActions_ActionID_MinExecutionsPerRun, p_MJAIAgentActions_ActionID_MaxExecutionsPerRun, p_MJAIAgentActions_ActionID_ResultExpirationTurns, p_MJAIAgentActions_ActionID_ResultExpirationMode, p_MJAIAgentActions_ActionID_CompactMode, p_MJAIAgentActions_ActionID_CompactLength, p_MJAIAgentActions_ActionID_CompactPromptID);

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
        PERFORM __mj."spUpdateAIAgentStep"(p_MJAIAgentSteps_ActionIDID, p_MJAIAgentSteps_ActionID_AgentID, p_MJAIAgentSteps_ActionID_Name, p_MJAIAgentSteps_ActionID_Description, p_MJAIAgentSteps_ActionID_StepType, p_MJAIAgentSteps_ActionID_StartingStep, p_MJAIAgentSteps_ActionID_TimeoutSeconds, p_MJAIAgentSteps_ActionID_RetryCount, p_MJAIAgentSteps_ActionID_OnErrorBehavior, p_MJAIAgentSteps_ActionID_ActionID, p_MJAIAgentSteps_ActionID_SubAgentID, p_MJAIAgentSteps_ActionID_PromptID, p_MJAIAgentSteps_ActionID_ActionOutputMapping, p_MJAIAgentSteps_ActionID_PositionX, p_MJAIAgentSteps_ActionID_PositionY, p_MJAIAgentSteps_ActionID_Width, p_MJAIAgentSteps_ActionID_Height, p_MJAIAgentSteps_ActionID_Status, p_MJAIAgentSteps_ActionID_ActionInputMapping, p_MJAIAgentSteps_ActionID_LoopBodyType, p_MJAIAgentSteps_ActionID_Configuration);

    END LOOP;

    
    -- Cascade delete from EntityAction using cursor to call spDeleteEntityAction

    FOR _rec IN SELECT "ID" FROM __mj."EntityAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJEntityActions_ActionIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteEntityAction"(p_MJEntityActions_ActionIDID);
        
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
        PERFORM __mj."spUpdateMCPServerTool"(p_MJMCPServerTools_GeneratedActionIDID, p_MJMCPServerTools_GeneratedActionID_MCPServerID, p_MJMCPServerTools_GeneratedActionID_ToolName, p_MJMCPServerTools_GeneratedActionID_ToolTitle, p_MJMCPServerTools_GeneratedActionID_ToolDescription, p_MJMCPServerTools_GeneratedActionID_InputSchema, p_MJMCPServerTools_GeneratedActionID_OutputSchema, p_MJMCPServerTools_GeneratedActionID_Annotations, p_MJMCPServerTools_GeneratedActionID_Status, p_MJMCPServerTools_GeneratedActionID_DiscoveredAt, p_MJMCPServerTools_GeneratedActionID_LastSeenAt, p_MJMCPServerTools_GeneratedActionID_GeneratedActionID, p_MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID);

    END LOOP;

    
    -- Cascade delete from ScheduledAction using cursor to call spDeleteScheduledAction

    FOR _rec IN SELECT "ID" FROM __mj."ScheduledAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJScheduledActions_ActionIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteScheduledAction"(p_MJScheduledActions_ActionIDID);
        
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
        PERFORM __mj."spUpdateAIAgentConfiguration"(p_MJAIAgentConfigurations_AIConfigurationIDID, p_MJAIAgentConfigurations_AIConfigurationID_AgentID, p_MJAIAgentConfigurations_AIConfigurationID_Name, p_MJAIAgentConfigurations_AIConfigurationID_DisplayName, p_MJAIAgentConfigurations_AIConfigurationID_Description, p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, p_MJAIAgentConfigurations_AIConfigurationID_IsDefault, p_MJAIAgentConfigurations_AIConfigurationID_Priority, p_MJAIAgentConfigurations_AIConfigurationID_Status);

    END LOOP;

    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIAgentPrompts_ConfigurationIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteAIAgentPrompt"(p_MJAIAgentPrompts_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes" FROM __mj."AIAgentRun" WHERE "ConfigurationID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_MJAIAgentRuns_ConfigurationIDID, p_MJAIAgentRuns_ConfigurationID_AgentID, p_MJAIAgentRuns_ConfigurationID_ParentRunID, p_MJAIAgentRuns_ConfigurationID_Status, p_MJAIAgentRuns_ConfigurationID_StartedAt, p_MJAIAgentRuns_ConfigurationID_CompletedAt, p_MJAIAgentRuns_ConfigurationID_Success, p_MJAIAgentRuns_ConfigurationID_ErrorMessage, p_MJAIAgentRuns_ConfigurationID_ConversationID, p_MJAIAgentRuns_ConfigurationID_UserID, p_MJAIAgentRuns_ConfigurationID_Result, p_MJAIAgentRuns_ConfigurationID_AgentState, p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed, p_MJAIAgentRuns_ConfigurationID_TotalCost, p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, p_MJAIAgentRuns_ConfigurationID_TotalCostRollup, p_MJAIAgentRuns_ConfigurationID_ConversationDetailID, p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, p_MJAIAgentRuns_ConfigurationID_CancellationReason, p_MJAIAgentRuns_ConfigurationID_FinalStep, p_MJAIAgentRuns_ConfigurationID_FinalPayload, p_MJAIAgentRuns_ConfigurationID_Message, p_MJAIAgentRuns_ConfigurationID_LastRunID, p_MJAIAgentRuns_ConfigurationID_StartingPayload, p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations, p_MJAIAgentRuns_ConfigurationID_ConfigurationID, p_MJAIAgentRuns_ConfigurationID_OverrideModelID, p_MJAIAgentRuns_ConfigurationID_OverrideVendorID, p_MJAIAgentRuns_ConfigurationID_Data, p_MJAIAgentRuns_ConfigurationID_Verbose, p_MJAIAgentRuns_ConfigurationID_EffortLevel, p_MJAIAgentRuns_ConfigurationID_RunName, p_MJAIAgentRuns_ConfigurationID_Comments, p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, p_MJAIAgentRuns_ConfigurationID_TestRunID, p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, p_MJAIAgentRuns_ConfigurationID_SecondaryScopes);

    END LOOP;

    
    -- Cascade delete from AIConfigurationParam using cursor to call spDeleteAIConfigurationParam

    FOR _rec IN SELECT "ID" FROM __mj."AIConfigurationParam" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIConfigurationParams_ConfigurationIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteAIConfigurationParam"(p_MJAIConfigurationParams_ConfigurationIDID);
        
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
        PERFORM __mj."spUpdateAIConfiguration"(p_MJAIConfigurations_ParentIDID, p_MJAIConfigurations_ParentID_Name, p_MJAIConfigurations_ParentID_Description, p_MJAIConfigurations_ParentID_IsDefault, p_MJAIConfigurations_ParentID_Status, p_MJAIConfigurations_ParentID_DefaultPromptForContextComp_77efd6, p_MJAIConfigurations_ParentID_DefaultPromptForContextSumm_ff5147, p_MJAIConfigurations_ParentID_DefaultStorageProviderID, p_MJAIConfigurations_ParentID_DefaultStorageRootPath, p_MJAIConfigurations_ParentID_ParentID);

    END LOOP;

    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptModel" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIPromptModels_ConfigurationIDID := _rec."ID";
        -- Call the delete SP for the related entity, which handles its own cascades
        PERFORM __mj."spDeleteAIPromptModel"(p_MJAIPromptModels_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID" FROM __mj."AIPromptRun" WHERE "ConfigurationID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_ConfigurationIDID, p_MJAIPromptRuns_ConfigurationID_PromptID, p_MJAIPromptRuns_ConfigurationID_ModelID, p_MJAIPromptRuns_ConfigurationID_VendorID, p_MJAIPromptRuns_ConfigurationID_AgentID, p_MJAIPromptRuns_ConfigurationID_ConfigurationID, p_MJAIPromptRuns_ConfigurationID_RunAt, p_MJAIPromptRuns_ConfigurationID_CompletedAt, p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, p_MJAIPromptRuns_ConfigurationID_Messages, p_MJAIPromptRuns_ConfigurationID_Result, p_MJAIPromptRuns_ConfigurationID_TokensUsed, p_MJAIPromptRuns_ConfigurationID_TokensPrompt, p_MJAIPromptRuns_ConfigurationID_TokensCompletion, p_MJAIPromptRuns_ConfigurationID_TotalCost, p_MJAIPromptRuns_ConfigurationID_Success, p_MJAIPromptRuns_ConfigurationID_ErrorMessage, p_MJAIPromptRuns_ConfigurationID_ParentID, p_MJAIPromptRuns_ConfigurationID_RunType, p_MJAIPromptRuns_ConfigurationID_ExecutionOrder, p_MJAIPromptRuns_ConfigurationID_AgentRunID, p_MJAIPromptRuns_ConfigurationID_Cost, p_MJAIPromptRuns_ConfigurationID_CostCurrency, p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup, p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup, p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, p_MJAIPromptRuns_ConfigurationID_Temperature, p_MJAIPromptRuns_ConfigurationID_TopP, p_MJAIPromptRuns_ConfigurationID_TopK, p_MJAIPromptRuns_ConfigurationID_MinP, p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty, p_MJAIPromptRuns_ConfigurationID_PresencePenalty, p_MJAIPromptRuns_ConfigurationID_Seed, p_MJAIPromptRuns_ConfigurationID_StopSequences, p_MJAIPromptRuns_ConfigurationID_ResponseFormat, p_MJAIPromptRuns_ConfigurationID_LogProbs, p_MJAIPromptRuns_ConfigurationID_TopLogProbs, p_MJAIPromptRuns_ConfigurationID_DescendantCost, p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed, p_MJAIPromptRuns_ConfigurationID_ValidationBehavior, p_MJAIPromptRuns_ConfigurationID_RetryStrategy, p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, p_MJAIPromptRuns_ConfigurationID_FinalValidationError, p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount, p_MJAIPromptRuns_ConfigurationID_CommonValidationError, p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt, p_MJAIPromptRuns_ConfigurationID_LastAttemptAt, p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, p_MJAIPromptRuns_ConfigurationID_ValidationAttempts, p_MJAIPromptRuns_ConfigurationID_ValidationSummary, p_MJAIPromptRuns_ConfigurationID_FailoverAttempts, p_MJAIPromptRuns_ConfigurationID_FailoverErrors, p_MJAIPromptRuns_ConfigurationID_FailoverDurations, p_MJAIPromptRuns_ConfigurationID_OriginalModelID, p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, p_MJAIPromptRuns_ConfigurationID_ModelSelection, p_MJAIPromptRuns_ConfigurationID_Status, p_MJAIPromptRuns_ConfigurationID_Cancelled, p_MJAIPromptRuns_ConfigurationID_CancellationReason, p_MJAIPromptRuns_ConfigurationID_ModelPowerRank, p_MJAIPromptRuns_ConfigurationID_SelectionStrategy, p_MJAIPromptRuns_ConfigurationID_CacheHit, p_MJAIPromptRuns_ConfigurationID_CacheKey, p_MJAIPromptRuns_ConfigurationID_JudgeID, p_MJAIPromptRuns_ConfigurationID_JudgeScore, p_MJAIPromptRuns_ConfigurationID_WasSelectedResult, p_MJAIPromptRuns_ConfigurationID_StreamingEnabled, p_MJAIPromptRuns_ConfigurationID_FirstTokenTime, p_MJAIPromptRuns_ConfigurationID_ErrorDetails, p_MJAIPromptRuns_ConfigurationID_ChildPromptID, p_MJAIPromptRuns_ConfigurationID_QueueTime, p_MJAIPromptRuns_ConfigurationID_PromptTime, p_MJAIPromptRuns_ConfigurationID_CompletionTime, p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, p_MJAIPromptRuns_ConfigurationID_EffortLevel, p_MJAIPromptRuns_ConfigurationID_RunName, p_MJAIPromptRuns_ConfigurationID_Comments, p_MJAIPromptRuns_ConfigurationID_TestRunID);

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
        PERFORM __mj."spUpdateAIResultCache"(p_MJAIResultCache_ConfigurationIDID, p_MJAIResultCache_ConfigurationID_AIPromptID, p_MJAIResultCache_ConfigurationID_AIModelID, p_MJAIResultCache_ConfigurationID_RunAt, p_MJAIResultCache_ConfigurationID_PromptText, p_MJAIResultCache_ConfigurationID_ResultText, p_MJAIResultCache_ConfigurationID_Status, p_MJAIResultCache_ConfigurationID_ExpiredOn, p_MJAIResultCache_ConfigurationID_VendorID, p_MJAIResultCache_ConfigurationID_AgentID, p_MJAIResultCache_ConfigurationID_ConfigurationID, p_MJAIResultCache_ConfigurationID_PromptEmbedding, p_MJAIResultCache_ConfigurationID_PromptRunID);

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


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================


-- ===================== FK & CHECK Constraints =====================


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Actions */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete Permissions for MJ: AI Configurations */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfiguration" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================
