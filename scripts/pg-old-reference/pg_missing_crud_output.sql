-- Auto-generated PostgreSQL CRUD functions for missing SQL Server SPs
-- Total functions: 87

-- spCreateAIAgent
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_LogoURL CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_ExposeAsAction BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ExecutionOrder INTEGER DEFAULT NULL::INTEGER,
    p_ExecutionMode CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_EnableContextCompression BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ContextCompressionMessageThreshold INTEGER DEFAULT NULL::INTEGER,
    p_ContextCompressionPromptID UUID DEFAULT NULL::UUID,
    p_ContextCompressionMessageRetentionCount INTEGER DEFAULT NULL::INTEGER,
    p_TypeID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_DriverClass CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_IconClass CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_ModelSelectionMode CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_PayloadDownstreamPaths TEXT DEFAULT NULL::TEXT,
    p_PayloadUpstreamPaths TEXT DEFAULT NULL::TEXT,
    p_PayloadSelfReadPaths TEXT DEFAULT NULL::TEXT,
    p_PayloadSelfWritePaths TEXT DEFAULT NULL::TEXT,
    p_PayloadScope TEXT DEFAULT NULL::TEXT,
    p_FinalPayloadValidation TEXT DEFAULT NULL::TEXT,
    p_FinalPayloadValidationMode CHARACTER VARYING(25) DEFAULT NULL::CHARACTER VARYING(25),
    p_FinalPayloadValidationMaxRetries INTEGER DEFAULT NULL::INTEGER,
    p_MaxCostPerRun NUMERIC(10,4) DEFAULT NULL::NUMERIC(10,4),
    p_MaxTokensPerRun INTEGER DEFAULT NULL::INTEGER,
    p_MaxIterationsPerRun INTEGER DEFAULT NULL::INTEGER,
    p_MaxTimePerRun INTEGER DEFAULT NULL::INTEGER,
    p_MinExecutionsPerRun INTEGER DEFAULT NULL::INTEGER,
    p_MaxExecutionsPerRun INTEGER DEFAULT NULL::INTEGER,
    p_StartingPayloadValidation TEXT DEFAULT NULL::TEXT,
    p_StartingPayloadValidationMode CHARACTER VARYING(25) DEFAULT NULL::CHARACTER VARYING(25),
    p_DefaultPromptEffortLevel INTEGER DEFAULT NULL::INTEGER,
    p_ChatHandlingOption CHARACTER VARYING(30) DEFAULT NULL::CHARACTER VARYING(30),
    p_DefaultArtifactTypeID UUID DEFAULT NULL::UUID,
    p_OwnerUserID UUID DEFAULT NULL::UUID,
    p_InvocationMode CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ArtifactCreationMode CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_FunctionalRequirements TEXT DEFAULT NULL::TEXT,
    p_TechnicalDesign TEXT DEFAULT NULL::TEXT,
    p_InjectNotes BOOLEAN DEFAULT NULL::BOOLEAN,
    p_MaxNotesToInject INTEGER DEFAULT NULL::INTEGER,
    p_NoteInjectionStrategy CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_InjectExamples BOOLEAN DEFAULT NULL::BOOLEAN,
    p_MaxExamplesToInject INTEGER DEFAULT NULL::INTEGER,
    p_ExampleInjectionStrategy CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_IsRestricted BOOLEAN DEFAULT NULL::BOOLEAN,
    p_MessageMode CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_MaxMessages INTEGER DEFAULT NULL::INTEGER,
    p_AttachmentStorageProviderID UUID DEFAULT NULL::UUID,
    p_AttachmentRootPath CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_InlineStorageThresholdBytes INTEGER DEFAULT NULL::INTEGER,
    p_AgentTypePromptParams TEXT DEFAULT NULL::TEXT,
    p_ScopeConfig TEXT DEFAULT NULL::TEXT,
    p_NoteRetentionDays INTEGER DEFAULT NULL::INTEGER,
    p_ExampleRetentionDays INTEGER DEFAULT NULL::INTEGER,
    p_AutoArchiveEnabled BOOLEAN DEFAULT NULL::BOOLEAN,
    p_RerankerConfiguration TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwAIAgents"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgent"
            ("ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration")
        VALUES
            (p_ID, p_Name, p_Description, p_LogoURL, p_ParentID, COALESCE(p_ExposeAsAction, FALSE), COALESCE(p_ExecutionOrder, 0), COALESCE(p_ExecutionMode, 'Sequential'), COALESCE(p_EnableContextCompression, FALSE), p_ContextCompressionMessageThreshold, p_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount, p_TypeID, COALESCE(p_Status, 'Pending'), p_DriverClass, p_IconClass, COALESCE(p_ModelSelectionMode, 'Agent Type'), COALESCE(p_PayloadDownstreamPaths, '["*"]'), COALESCE(p_PayloadUpstreamPaths, '["*"]'), p_PayloadSelfReadPaths, p_PayloadSelfWritePaths, p_PayloadScope, p_FinalPayloadValidation, COALESCE(p_FinalPayloadValidationMode, 'Retry'), COALESCE(p_FinalPayloadValidationMaxRetries, 3), p_MaxCostPerRun, p_MaxTokensPerRun, p_MaxIterationsPerRun, p_MaxTimePerRun, p_MinExecutionsPerRun, p_MaxExecutionsPerRun, p_StartingPayloadValidation, COALESCE(p_StartingPayloadValidationMode, 'Fail'), p_DefaultPromptEffortLevel, p_ChatHandlingOption, p_DefaultArtifactTypeID, COALESCE(p_OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'), COALESCE(p_InvocationMode, 'Any'), COALESCE(p_ArtifactCreationMode, 'Always'), p_FunctionalRequirements, p_TechnicalDesign, COALESCE(p_InjectNotes, TRUE), COALESCE(p_MaxNotesToInject, 5), COALESCE(p_NoteInjectionStrategy, 'Relevant'), COALESCE(p_InjectExamples, FALSE), COALESCE(p_MaxExamplesToInject, 3), COALESCE(p_ExampleInjectionStrategy, 'Semantic'), COALESCE(p_IsRestricted, FALSE), COALESCE(p_MessageMode, 'None'), p_MaxMessages, p_AttachmentStorageProviderID, p_AttachmentRootPath, p_InlineStorageThresholdBytes, p_AgentTypePromptParams, p_ScopeConfig, p_NoteRetentionDays, p_ExampleRetentionDays, COALESCE(p_AutoArchiveEnabled, TRUE), p_RerankerConfiguration)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgent"
            ("Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration")
        VALUES
            (p_Name, p_Description, p_LogoURL, p_ParentID, COALESCE(p_ExposeAsAction, FALSE), COALESCE(p_ExecutionOrder, 0), COALESCE(p_ExecutionMode, 'Sequential'), COALESCE(p_EnableContextCompression, FALSE), p_ContextCompressionMessageThreshold, p_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount, p_TypeID, COALESCE(p_Status, 'Pending'), p_DriverClass, p_IconClass, COALESCE(p_ModelSelectionMode, 'Agent Type'), COALESCE(p_PayloadDownstreamPaths, '["*"]'), COALESCE(p_PayloadUpstreamPaths, '["*"]'), p_PayloadSelfReadPaths, p_PayloadSelfWritePaths, p_PayloadScope, p_FinalPayloadValidation, COALESCE(p_FinalPayloadValidationMode, 'Retry'), COALESCE(p_FinalPayloadValidationMaxRetries, 3), p_MaxCostPerRun, p_MaxTokensPerRun, p_MaxIterationsPerRun, p_MaxTimePerRun, p_MinExecutionsPerRun, p_MaxExecutionsPerRun, p_StartingPayloadValidation, COALESCE(p_StartingPayloadValidationMode, 'Fail'), p_DefaultPromptEffortLevel, p_ChatHandlingOption, p_DefaultArtifactTypeID, COALESCE(p_OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'), COALESCE(p_InvocationMode, 'Any'), COALESCE(p_ArtifactCreationMode, 'Always'), p_FunctionalRequirements, p_TechnicalDesign, COALESCE(p_InjectNotes, TRUE), COALESCE(p_MaxNotesToInject, 5), COALESCE(p_NoteInjectionStrategy, 'Relevant'), COALESCE(p_InjectExamples, FALSE), COALESCE(p_MaxExamplesToInject, 3), COALESCE(p_ExampleInjectionStrategy, 'Semantic'), COALESCE(p_IsRestricted, FALSE), COALESCE(p_MessageMode, 'None'), p_MaxMessages, p_AttachmentStorageProviderID, p_AttachmentRootPath, p_InlineStorageThresholdBytes, p_AgentTypePromptParams, p_ScopeConfig, p_NoteRetentionDays, p_ExampleRetentionDays, COALESCE(p_AutoArchiveEnabled, TRUE), p_RerankerConfiguration)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIAgentExample
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentExample"(
    p_ID UUID DEFAULT NULL::UUID,
    p_AgentID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID,
    p_CompanyID UUID DEFAULT NULL::UUID,
    p_Type CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ExampleInput TEXT DEFAULT NULL::TEXT,
    p_ExampleOutput TEXT DEFAULT NULL::TEXT,
    p_IsAutoGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_SourceConversationID UUID DEFAULT NULL::UUID,
    p_SourceConversationDetailID UUID DEFAULT NULL::UUID,
    p_SourceAIAgentRunID UUID DEFAULT NULL::UUID,
    p_SuccessScore NUMERIC(5,2) DEFAULT NULL::NUMERIC(5,2),
    p_Comments TEXT DEFAULT NULL::TEXT,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_EmbeddingVector TEXT DEFAULT NULL::TEXT,
    p_EmbeddingModelID UUID DEFAULT NULL::UUID,
    p_PrimaryScopeEntityID UUID DEFAULT NULL::UUID,
    p_PrimaryScopeRecordID CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_SecondaryScopes TEXT DEFAULT NULL::TEXT,
    p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_AccessCount INTEGER DEFAULT NULL::INTEGER,
    p_ExpiresAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ
)
RETURNS SETOF __mj."vwAIAgentExamples"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentExample"
            ("ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_ID, p_AgentID, p_UserID, p_CompanyID, COALESCE(p_Type, 'Example'), p_ExampleInput, p_ExampleOutput, COALESCE(p_IsAutoGenerated, FALSE), p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_SuccessScore, p_Comments, COALESCE(p_Status, 'Active'), p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, COALESCE(p_AccessCount, 0), p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentExample"
            ("AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_AgentID, p_UserID, p_CompanyID, COALESCE(p_Type, 'Example'), p_ExampleInput, p_ExampleOutput, COALESCE(p_IsAutoGenerated, FALSE), p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_SuccessScore, p_Comments, COALESCE(p_Status, 'Active'), p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, COALESCE(p_AccessCount, 0), p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentExamples" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIAgentNote
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNote"(
    p_ID UUID DEFAULT NULL::UUID,
    p_AgentID UUID DEFAULT NULL::UUID,
    p_AgentNoteTypeID UUID DEFAULT NULL::UUID,
    p_Note TEXT DEFAULT NULL::TEXT,
    p_UserID UUID DEFAULT NULL::UUID,
    p_Type CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_IsAutoGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_Comments TEXT DEFAULT NULL::TEXT,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_SourceConversationID UUID DEFAULT NULL::UUID,
    p_SourceConversationDetailID UUID DEFAULT NULL::UUID,
    p_SourceAIAgentRunID UUID DEFAULT NULL::UUID,
    p_CompanyID UUID DEFAULT NULL::UUID,
    p_EmbeddingVector TEXT DEFAULT NULL::TEXT,
    p_EmbeddingModelID UUID DEFAULT NULL::UUID,
    p_PrimaryScopeEntityID UUID DEFAULT NULL::UUID,
    p_PrimaryScopeRecordID CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_SecondaryScopes TEXT DEFAULT NULL::TEXT,
    p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_AccessCount INTEGER DEFAULT NULL::INTEGER,
    p_ExpiresAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ
)
RETURNS SETOF __mj."vwAIAgentNotes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentNote"
            ("ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_ID, p_AgentID, p_AgentNoteTypeID, p_Note, p_UserID, COALESCE(p_Type, 'Preference'), COALESCE(p_IsAutoGenerated, FALSE), p_Comments, COALESCE(p_Status, 'Active'), p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_CompanyID, p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, COALESCE(p_AccessCount, 0), p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentNote"
            ("AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_AgentID, p_AgentNoteTypeID, p_Note, p_UserID, COALESCE(p_Type, 'Preference'), COALESCE(p_IsAutoGenerated, FALSE), p_Comments, COALESCE(p_Status, 'Active'), p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_CompanyID, p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, COALESCE(p_AccessCount, 0), p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIAgentRun
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(
    p_ID UUID DEFAULT NULL::UUID,
    p_AgentID UUID DEFAULT NULL::UUID,
    p_ParentRunID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_StartedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_CompletedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_Success BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ErrorMessage TEXT DEFAULT NULL::TEXT,
    p_ConversationID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID,
    p_Result TEXT DEFAULT NULL::TEXT,
    p_AgentState TEXT DEFAULT NULL::TEXT,
    p_TotalTokensUsed INTEGER DEFAULT NULL::INTEGER,
    p_TotalCost NUMERIC(18,6) DEFAULT NULL::NUMERIC(18,6),
    p_TotalPromptTokensUsed INTEGER DEFAULT NULL::INTEGER,
    p_TotalCompletionTokensUsed INTEGER DEFAULT NULL::INTEGER,
    p_TotalTokensUsedRollup INTEGER DEFAULT NULL::INTEGER,
    p_TotalPromptTokensUsedRollup INTEGER DEFAULT NULL::INTEGER,
    p_TotalCompletionTokensUsedRollup INTEGER DEFAULT NULL::INTEGER,
    p_TotalCostRollup NUMERIC(19,8) DEFAULT NULL::NUMERIC(19,8),
    p_ConversationDetailID UUID DEFAULT NULL::UUID,
    p_ConversationDetailSequence INTEGER DEFAULT NULL::INTEGER,
    p_CancellationReason CHARACTER VARYING(30) DEFAULT NULL::CHARACTER VARYING(30),
    p_FinalStep CHARACTER VARYING(30) DEFAULT NULL::CHARACTER VARYING(30),
    p_FinalPayload TEXT DEFAULT NULL::TEXT,
    p_Message TEXT DEFAULT NULL::TEXT,
    p_LastRunID UUID DEFAULT NULL::UUID,
    p_StartingPayload TEXT DEFAULT NULL::TEXT,
    p_TotalPromptIterations INTEGER DEFAULT NULL::INTEGER,
    p_ConfigurationID UUID DEFAULT NULL::UUID,
    p_OverrideModelID UUID DEFAULT NULL::UUID,
    p_OverrideVendorID UUID DEFAULT NULL::UUID,
    p_Data TEXT DEFAULT NULL::TEXT,
    p_Verbose BOOLEAN DEFAULT NULL::BOOLEAN,
    p_EffortLevel INTEGER DEFAULT NULL::INTEGER,
    p_RunName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Comments TEXT DEFAULT NULL::TEXT,
    p_ScheduledJobRunID UUID DEFAULT NULL::UUID,
    p_TestRunID UUID DEFAULT NULL::UUID,
    p_PrimaryScopeEntityID UUID DEFAULT NULL::UUID,
    p_PrimaryScopeRecordID CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_SecondaryScopes TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwAIAgentRuns"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRun"
            ("ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes")
        VALUES
            (p_ID, p_AgentID, p_ParentRunID, COALESCE(p_Status, 'Running'), COALESCE(p_StartedAt, NOW()), p_CompletedAt, p_Success, p_ErrorMessage, p_ConversationID, p_UserID, p_Result, p_AgentState, p_TotalTokensUsed, p_TotalCost, p_TotalPromptTokensUsed, p_TotalCompletionTokensUsed, p_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup, p_TotalCostRollup, p_ConversationDetailID, p_ConversationDetailSequence, p_CancellationReason, p_FinalStep, p_FinalPayload, p_Message, p_LastRunID, p_StartingPayload, COALESCE(p_TotalPromptIterations, 0), p_ConfigurationID, p_OverrideModelID, p_OverrideVendorID, p_Data, p_Verbose, p_EffortLevel, p_RunName, p_Comments, p_ScheduledJobRunID, p_TestRunID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentRun"
            ("AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes")
        VALUES
            (p_AgentID, p_ParentRunID, COALESCE(p_Status, 'Running'), COALESCE(p_StartedAt, NOW()), p_CompletedAt, p_Success, p_ErrorMessage, p_ConversationID, p_UserID, p_Result, p_AgentState, p_TotalTokensUsed, p_TotalCost, p_TotalPromptTokensUsed, p_TotalCompletionTokensUsed, p_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup, p_TotalCostRollup, p_ConversationDetailID, p_ConversationDetailSequence, p_CancellationReason, p_FinalStep, p_FinalPayload, p_Message, p_LastRunID, p_StartingPayload, COALESCE(p_TotalPromptIterations, 0), p_ConfigurationID, p_OverrideModelID, p_OverrideVendorID, p_Data, p_Verbose, p_EffortLevel, p_RunName, p_Comments, p_ScheduledJobRunID, p_TestRunID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIAgentRunStep
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRunStep"(
    p_ID UUID DEFAULT NULL::UUID,
    p_AgentRunID UUID DEFAULT NULL::UUID,
    p_StepNumber INTEGER DEFAULT NULL::INTEGER,
    p_StepType CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_StepName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_TargetID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_StartedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_CompletedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_Success BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ErrorMessage TEXT DEFAULT NULL::TEXT,
    p_InputData TEXT DEFAULT NULL::TEXT,
    p_OutputData TEXT DEFAULT NULL::TEXT,
    p_TargetLogID UUID DEFAULT NULL::UUID,
    p_PayloadAtStart TEXT DEFAULT NULL::TEXT,
    p_PayloadAtEnd TEXT DEFAULT NULL::TEXT,
    p_FinalPayloadValidationResult CHARACTER VARYING(25) DEFAULT NULL::CHARACTER VARYING(25),
    p_FinalPayloadValidationMessages TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Comments TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwAIAgentRunSteps"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRunStep"
            ("ID", "AgentRunID", "StepNumber", "StepType", "StepName", "TargetID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "InputData", "OutputData", "TargetLogID", "PayloadAtStart", "PayloadAtEnd", "FinalPayloadValidationResult", "FinalPayloadValidationMessages", "ParentID", "Comments")
        VALUES
            (p_ID, p_AgentRunID, p_StepNumber, COALESCE(p_StepType, 'Prompt'), p_StepName, p_TargetID, COALESCE(p_Status, 'Running'), COALESCE(p_StartedAt, NOW()), p_CompletedAt, p_Success, p_ErrorMessage, p_InputData, p_OutputData, p_TargetLogID, p_PayloadAtStart, p_PayloadAtEnd, p_FinalPayloadValidationResult, p_FinalPayloadValidationMessages, p_ParentID, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentRunStep"
            ("AgentRunID", "StepNumber", "StepType", "StepName", "TargetID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "InputData", "OutputData", "TargetLogID", "PayloadAtStart", "PayloadAtEnd", "FinalPayloadValidationResult", "FinalPayloadValidationMessages", "ParentID", "Comments")
        VALUES
            (p_AgentRunID, p_StepNumber, COALESCE(p_StepType, 'Prompt'), p_StepName, p_TargetID, COALESCE(p_Status, 'Running'), COALESCE(p_StartedAt, NOW()), p_CompletedAt, p_Success, p_ErrorMessage, p_InputData, p_OutputData, p_TargetLogID, p_PayloadAtStart, p_PayloadAtEnd, p_FinalPayloadValidationResult, p_FinalPayloadValidationMessages, p_ParentID, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRunSteps" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIArchitecture
CREATE OR REPLACE FUNCTION __mj."spCreateAIArchitecture"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_Category CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_ParentArchitectureID UUID DEFAULT NULL::UUID,
    p_WikipediaURL CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_YearIntroduced INTEGER DEFAULT NULL::INTEGER,
    p_KeyPaper CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500)
)
RETURNS SETOF __mj."vwAIArchitectures"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIArchitecture"
            ("ID", "Name", "Description", "Category", "ParentArchitectureID", "WikipediaURL", "YearIntroduced", "KeyPaper")
        VALUES
            (p_ID, p_Name, p_Description, p_Category, p_ParentArchitectureID, p_WikipediaURL, p_YearIntroduced, p_KeyPaper)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIArchitecture"
            ("Name", "Description", "Category", "ParentArchitectureID", "WikipediaURL", "YearIntroduced", "KeyPaper")
        VALUES
            (p_Name, p_Description, p_Category, p_ParentArchitectureID, p_WikipediaURL, p_YearIntroduced, p_KeyPaper)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIArchitectures" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIConfiguration
CREATE OR REPLACE FUNCTION __mj."spCreateAIConfiguration"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_IsDefault BOOLEAN DEFAULT NULL::BOOLEAN,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_DefaultPromptForContextCompressionID UUID DEFAULT NULL::UUID,
    p_DefaultPromptForContextSummarizationID UUID DEFAULT NULL::UUID,
    p_DefaultStorageProviderID UUID DEFAULT NULL::UUID,
    p_DefaultStorageRootPath CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_ParentID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwAIConfigurations"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIConfiguration"
            ("ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID")
        VALUES
            (p_ID, p_Name, p_Description, COALESCE(p_IsDefault, FALSE), COALESCE(p_Status, 'Active'), p_DefaultPromptForContextCompressionID, p_DefaultPromptForContextSummarizationID, p_DefaultStorageProviderID, p_DefaultStorageRootPath, p_ParentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIConfiguration"
            ("Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID")
        VALUES
            (p_Name, p_Description, COALESCE(p_IsDefault, FALSE), COALESCE(p_Status, 'Active'), p_DefaultPromptForContextCompressionID, p_DefaultPromptForContextSummarizationID, p_DefaultStorageProviderID, p_DefaultStorageRootPath, p_ParentID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIConfigurations" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIPrompt
CREATE OR REPLACE FUNCTION __mj."spCreateAIPrompt"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_TemplateID UUID DEFAULT NULL::UUID,
    p_CategoryID UUID DEFAULT NULL::UUID,
    p_TypeID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_ResponseFormat CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ModelSpecificResponseFormat TEXT DEFAULT NULL::TEXT,
    p_AIModelTypeID UUID DEFAULT NULL::UUID,
    p_MinPowerRank INTEGER DEFAULT NULL::INTEGER,
    p_SelectionStrategy CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_PowerPreference CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ParallelizationMode CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ParallelCount INTEGER DEFAULT NULL::INTEGER,
    p_ParallelConfigParam CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_OutputType CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_OutputExample TEXT DEFAULT NULL::TEXT,
    p_ValidationBehavior CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_MaxRetries INTEGER DEFAULT NULL::INTEGER,
    p_RetryDelayMS INTEGER DEFAULT NULL::INTEGER,
    p_RetryStrategy CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ResultSelectorPromptID UUID DEFAULT NULL::UUID,
    p_EnableCaching BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CacheTTLSeconds INTEGER DEFAULT NULL::INTEGER,
    p_CacheMatchType CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_CacheSimilarityThreshold DOUBLE PRECISION DEFAULT NULL::DOUBLE PRECISION,
    p_CacheMustMatchModel BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CacheMustMatchVendor BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CacheMustMatchAgent BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CacheMustMatchConfig BOOLEAN DEFAULT NULL::BOOLEAN,
    p_PromptRole CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_PromptPosition CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_Temperature NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_TopP NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_TopK INTEGER DEFAULT NULL::INTEGER,
    p_MinP NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_FrequencyPenalty NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_PresencePenalty NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_Seed INTEGER DEFAULT NULL::INTEGER,
    p_StopSequences CHARACTER VARYING(1000) DEFAULT NULL::CHARACTER VARYING(1000),
    p_IncludeLogProbs BOOLEAN DEFAULT NULL::BOOLEAN,
    p_TopLogProbs INTEGER DEFAULT NULL::INTEGER,
    p_FailoverStrategy CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_FailoverMaxAttempts INTEGER DEFAULT NULL::INTEGER,
    p_FailoverDelaySeconds INTEGER DEFAULT NULL::INTEGER,
    p_FailoverModelStrategy CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_FailoverErrorScope CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_EffortLevel INTEGER DEFAULT NULL::INTEGER
)
RETURNS SETOF __mj."vwAIPrompts"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPrompt"
            ("ID", "Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel")
        VALUES
            (p_ID, p_Name, p_Description, p_TemplateID, p_CategoryID, p_TypeID, p_Status, COALESCE(p_ResponseFormat, 'Any'), p_ModelSpecificResponseFormat, p_AIModelTypeID, p_MinPowerRank, COALESCE(p_SelectionStrategy, 'Default'), COALESCE(p_PowerPreference, 'Highest'), COALESCE(p_ParallelizationMode, 'None'), p_ParallelCount, p_ParallelConfigParam, COALESCE(p_OutputType, 'string'), p_OutputExample, COALESCE(p_ValidationBehavior, 'Warn'), COALESCE(p_MaxRetries, 0), COALESCE(p_RetryDelayMS, 0), COALESCE(p_RetryStrategy, 'Fixed'), p_ResultSelectorPromptID, COALESCE(p_EnableCaching, FALSE), p_CacheTTLSeconds, COALESCE(p_CacheMatchType, 'Exact'), p_CacheSimilarityThreshold, COALESCE(p_CacheMustMatchModel, TRUE), COALESCE(p_CacheMustMatchVendor, TRUE), COALESCE(p_CacheMustMatchAgent, FALSE), COALESCE(p_CacheMustMatchConfig, FALSE), COALESCE(p_PromptRole, 'System'), COALESCE(p_PromptPosition, 'First'), p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_IncludeLogProbs, p_TopLogProbs, COALESCE(p_FailoverStrategy, 'SameModelDifferentVendor'), p_FailoverMaxAttempts, p_FailoverDelaySeconds, COALESCE(p_FailoverModelStrategy, 'PreferSameModel'), COALESCE(p_FailoverErrorScope, 'All'), p_EffortLevel)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPrompt"
            ("Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel")
        VALUES
            (p_Name, p_Description, p_TemplateID, p_CategoryID, p_TypeID, p_Status, COALESCE(p_ResponseFormat, 'Any'), p_ModelSpecificResponseFormat, p_AIModelTypeID, p_MinPowerRank, COALESCE(p_SelectionStrategy, 'Default'), COALESCE(p_PowerPreference, 'Highest'), COALESCE(p_ParallelizationMode, 'None'), p_ParallelCount, p_ParallelConfigParam, COALESCE(p_OutputType, 'string'), p_OutputExample, COALESCE(p_ValidationBehavior, 'Warn'), COALESCE(p_MaxRetries, 0), COALESCE(p_RetryDelayMS, 0), COALESCE(p_RetryStrategy, 'Fixed'), p_ResultSelectorPromptID, COALESCE(p_EnableCaching, FALSE), p_CacheTTLSeconds, COALESCE(p_CacheMatchType, 'Exact'), p_CacheSimilarityThreshold, COALESCE(p_CacheMustMatchModel, TRUE), COALESCE(p_CacheMustMatchVendor, TRUE), COALESCE(p_CacheMustMatchAgent, FALSE), COALESCE(p_CacheMustMatchConfig, FALSE), COALESCE(p_PromptRole, 'System'), COALESCE(p_PromptPosition, 'First'), p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_IncludeLogProbs, p_TopLogProbs, COALESCE(p_FailoverStrategy, 'SameModelDifferentVendor'), p_FailoverMaxAttempts, p_FailoverDelaySeconds, COALESCE(p_FailoverModelStrategy, 'PreferSameModel'), COALESCE(p_FailoverErrorScope, 'All'), p_EffortLevel)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPrompts" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIPromptCategory
CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Description TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwAIPromptCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPromptCategory"
            ("ID", "Name", "ParentID", "Description")
        VALUES
            (p_ID, p_Name, p_ParentID, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPromptCategory"
            ("Name", "ParentID", "Description")
        VALUES
            (p_Name, p_ParentID, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAIPromptRun
CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(
    p_ID UUID DEFAULT NULL::UUID,
    p_PromptID UUID DEFAULT NULL::UUID,
    p_ModelID UUID DEFAULT NULL::UUID,
    p_VendorID UUID DEFAULT NULL::UUID,
    p_AgentID UUID DEFAULT NULL::UUID,
    p_ConfigurationID UUID DEFAULT NULL::UUID,
    p_RunAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_CompletedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_ExecutionTimeMS INTEGER DEFAULT NULL::INTEGER,
    p_Messages TEXT DEFAULT NULL::TEXT,
    p_Result TEXT DEFAULT NULL::TEXT,
    p_TokensUsed INTEGER DEFAULT NULL::INTEGER,
    p_TokensPrompt INTEGER DEFAULT NULL::INTEGER,
    p_TokensCompletion INTEGER DEFAULT NULL::INTEGER,
    p_TotalCost NUMERIC(18,6) DEFAULT NULL::NUMERIC(18,6),
    p_Success BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ErrorMessage TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_RunType CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ExecutionOrder INTEGER DEFAULT NULL::INTEGER,
    p_AgentRunID UUID DEFAULT NULL::UUID,
    p_Cost NUMERIC(19,8) DEFAULT NULL::NUMERIC(19,8),
    p_CostCurrency CHARACTER VARYING(10) DEFAULT NULL::CHARACTER VARYING(10),
    p_TokensUsedRollup INTEGER DEFAULT NULL::INTEGER,
    p_TokensPromptRollup INTEGER DEFAULT NULL::INTEGER,
    p_TokensCompletionRollup INTEGER DEFAULT NULL::INTEGER,
    p_Temperature NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_TopP NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_TopK INTEGER DEFAULT NULL::INTEGER,
    p_MinP NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_FrequencyPenalty NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_PresencePenalty NUMERIC(3,2) DEFAULT NULL::NUMERIC(3,2),
    p_Seed INTEGER DEFAULT NULL::INTEGER,
    p_StopSequences TEXT DEFAULT NULL::TEXT,
    p_ResponseFormat CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_LogProbs BOOLEAN DEFAULT NULL::BOOLEAN,
    p_TopLogProbs INTEGER DEFAULT NULL::INTEGER,
    p_DescendantCost NUMERIC(18,6) DEFAULT NULL::NUMERIC(18,6),
    p_ValidationAttemptCount INTEGER DEFAULT NULL::INTEGER,
    p_SuccessfulValidationCount INTEGER DEFAULT NULL::INTEGER,
    p_FinalValidationPassed BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ValidationBehavior CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_RetryStrategy CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_MaxRetriesConfigured INTEGER DEFAULT NULL::INTEGER,
    p_FinalValidationError CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_ValidationErrorCount INTEGER DEFAULT NULL::INTEGER,
    p_CommonValidationError CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_FirstAttemptAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_LastAttemptAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_TotalRetryDurationMS INTEGER DEFAULT NULL::INTEGER,
    p_ValidationAttempts TEXT DEFAULT NULL::TEXT,
    p_ValidationSummary TEXT DEFAULT NULL::TEXT,
    p_FailoverAttempts INTEGER DEFAULT NULL::INTEGER,
    p_FailoverErrors TEXT DEFAULT NULL::TEXT,
    p_FailoverDurations TEXT DEFAULT NULL::TEXT,
    p_OriginalModelID UUID DEFAULT NULL::UUID,
    p_OriginalRequestStartTime TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_TotalFailoverDuration INTEGER DEFAULT NULL::INTEGER,
    p_RerunFromPromptRunID UUID DEFAULT NULL::UUID,
    p_ModelSelection TEXT DEFAULT NULL::TEXT,
    p_Status CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_Cancelled BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CancellationReason TEXT DEFAULT NULL::TEXT,
    p_ModelPowerRank INTEGER DEFAULT NULL::INTEGER,
    p_SelectionStrategy CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_CacheHit BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CacheKey CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_JudgeID UUID DEFAULT NULL::UUID,
    p_JudgeScore DOUBLE PRECISION DEFAULT NULL::DOUBLE PRECISION,
    p_WasSelectedResult BOOLEAN DEFAULT NULL::BOOLEAN,
    p_StreamingEnabled BOOLEAN DEFAULT NULL::BOOLEAN,
    p_FirstTokenTime INTEGER DEFAULT NULL::INTEGER,
    p_ErrorDetails TEXT DEFAULT NULL::TEXT,
    p_ChildPromptID UUID DEFAULT NULL::UUID,
    p_QueueTime INTEGER DEFAULT NULL::INTEGER,
    p_PromptTime INTEGER DEFAULT NULL::INTEGER,
    p_CompletionTime INTEGER DEFAULT NULL::INTEGER,
    p_ModelSpecificResponseDetails TEXT DEFAULT NULL::TEXT,
    p_EffortLevel INTEGER DEFAULT NULL::INTEGER,
    p_RunName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Comments TEXT DEFAULT NULL::TEXT,
    p_TestRunID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwAIPromptRuns"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPromptRun"
            ("ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID")
        VALUES
            (p_ID, p_PromptID, p_ModelID, p_VendorID, p_AgentID, p_ConfigurationID, COALESCE(p_RunAt, NOW()), p_CompletedAt, p_ExecutionTimeMS, p_Messages, p_Result, p_TokensUsed, p_TokensPrompt, p_TokensCompletion, p_TotalCost, COALESCE(p_Success, FALSE), p_ErrorMessage, p_ParentID, COALESCE(p_RunType, 'Single'), p_ExecutionOrder, p_AgentRunID, p_Cost, p_CostCurrency, p_TokensUsedRollup, p_TokensPromptRollup, p_TokensCompletionRollup, p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_ResponseFormat, p_LogProbs, p_TopLogProbs, p_DescendantCost, p_ValidationAttemptCount, p_SuccessfulValidationCount, p_FinalValidationPassed, p_ValidationBehavior, p_RetryStrategy, p_MaxRetriesConfigured, p_FinalValidationError, p_ValidationErrorCount, p_CommonValidationError, p_FirstAttemptAt, p_LastAttemptAt, p_TotalRetryDurationMS, p_ValidationAttempts, p_ValidationSummary, p_FailoverAttempts, p_FailoverErrors, p_FailoverDurations, p_OriginalModelID, p_OriginalRequestStartTime, p_TotalFailoverDuration, p_RerunFromPromptRunID, p_ModelSelection, COALESCE(p_Status, 'Pending'), COALESCE(p_Cancelled, FALSE), p_CancellationReason, p_ModelPowerRank, p_SelectionStrategy, COALESCE(p_CacheHit, FALSE), p_CacheKey, p_JudgeID, p_JudgeScore, COALESCE(p_WasSelectedResult, FALSE), COALESCE(p_StreamingEnabled, FALSE), p_FirstTokenTime, p_ErrorDetails, p_ChildPromptID, p_QueueTime, p_PromptTime, p_CompletionTime, p_ModelSpecificResponseDetails, p_EffortLevel, p_RunName, p_Comments, p_TestRunID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPromptRun"
            ("PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID")
        VALUES
            (p_PromptID, p_ModelID, p_VendorID, p_AgentID, p_ConfigurationID, COALESCE(p_RunAt, NOW()), p_CompletedAt, p_ExecutionTimeMS, p_Messages, p_Result, p_TokensUsed, p_TokensPrompt, p_TokensCompletion, p_TotalCost, COALESCE(p_Success, FALSE), p_ErrorMessage, p_ParentID, COALESCE(p_RunType, 'Single'), p_ExecutionOrder, p_AgentRunID, p_Cost, p_CostCurrency, p_TokensUsedRollup, p_TokensPromptRollup, p_TokensCompletionRollup, p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_ResponseFormat, p_LogProbs, p_TopLogProbs, p_DescendantCost, p_ValidationAttemptCount, p_SuccessfulValidationCount, p_FinalValidationPassed, p_ValidationBehavior, p_RetryStrategy, p_MaxRetriesConfigured, p_FinalValidationError, p_ValidationErrorCount, p_CommonValidationError, p_FirstAttemptAt, p_LastAttemptAt, p_TotalRetryDurationMS, p_ValidationAttempts, p_ValidationSummary, p_FailoverAttempts, p_FailoverErrors, p_FailoverDurations, p_OriginalModelID, p_OriginalRequestStartTime, p_TotalFailoverDuration, p_RerunFromPromptRunID, p_ModelSelection, COALESCE(p_Status, 'Pending'), COALESCE(p_Cancelled, FALSE), p_CancellationReason, p_ModelPowerRank, p_SelectionStrategy, COALESCE(p_CacheHit, FALSE), p_CacheKey, p_JudgeID, p_JudgeScore, COALESCE(p_WasSelectedResult, FALSE), COALESCE(p_StreamingEnabled, FALSE), p_FirstTokenTime, p_ErrorDetails, p_ChildPromptID, p_QueueTime, p_PromptTime, p_CompletionTime, p_ModelSpecificResponseDetails, p_EffortLevel, p_RunName, p_Comments, p_TestRunID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAPIScope
CREATE OR REPLACE FUNCTION __mj."spCreateAPIScope"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Category CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_FullPath CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_ResourceType CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_IsActive BOOLEAN DEFAULT NULL::BOOLEAN,
    p_UIConfig TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwAPIScopes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIScope"
            ("ID", "Name", "Category", "Description", "ParentID", "FullPath", "ResourceType", "IsActive", "UIConfig")
        VALUES
            (p_ID, p_Name, p_Category, p_Description, p_ParentID, p_FullPath, p_ResourceType, COALESCE(p_IsActive, TRUE), p_UIConfig)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIScope"
            ("Name", "Category", "Description", "ParentID", "FullPath", "ResourceType", "IsActive", "UIConfig")
        VALUES
            (p_Name, p_Category, p_Description, p_ParentID, p_FullPath, p_ResourceType, COALESCE(p_IsActive, TRUE), p_UIConfig)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIScopes" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAction
CREATE OR REPLACE FUNCTION __mj."spCreateAction"(
    p_ID UUID DEFAULT NULL::UUID,
    p_CategoryID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(425) DEFAULT NULL::CHARACTER VARYING(425),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_Type CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_UserPrompt TEXT DEFAULT NULL::TEXT,
    p_UserComments TEXT DEFAULT NULL::TEXT,
    p_Code TEXT DEFAULT NULL::TEXT,
    p_CodeComments TEXT DEFAULT NULL::TEXT,
    p_CodeApprovalStatus CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_CodeApprovalComments TEXT DEFAULT NULL::TEXT,
    p_CodeApprovedByUserID UUID DEFAULT NULL::UUID,
    p_CodeApprovedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_CodeLocked BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ForceCodeGeneration BOOLEAN DEFAULT NULL::BOOLEAN,
    p_RetentionPeriod INTEGER DEFAULT NULL::INTEGER,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_DriverClass CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_IconClass CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_DefaultCompactPromptID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwActions"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Action"
            ("ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID")
        VALUES
            (p_ID, p_CategoryID, p_Name, p_Description, COALESCE(p_Type, 'Generated'), p_UserPrompt, p_UserComments, p_Code, p_CodeComments, COALESCE(p_CodeApprovalStatus, 'Pending'), p_CodeApprovalComments, p_CodeApprovedByUserID, p_CodeApprovedAt, COALESCE(p_CodeLocked, FALSE), COALESCE(p_ForceCodeGeneration, FALSE), p_RetentionPeriod, COALESCE(p_Status, 'Pending'), p_DriverClass, p_ParentID, p_IconClass, p_DefaultCompactPromptID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Action"
            ("CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID")
        VALUES
            (p_CategoryID, p_Name, p_Description, COALESCE(p_Type, 'Generated'), p_UserPrompt, p_UserComments, p_Code, p_CodeComments, COALESCE(p_CodeApprovalStatus, 'Pending'), p_CodeApprovalComments, p_CodeApprovedByUserID, p_CodeApprovedAt, COALESCE(p_CodeLocked, FALSE), COALESCE(p_ForceCodeGeneration, FALSE), p_RetentionPeriod, COALESCE(p_Status, 'Pending'), p_DriverClass, p_ParentID, p_IconClass, p_DefaultCompactPromptID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActions" WHERE "ID" = v_id;
END;
$function$;

-- spCreateActionCategory
CREATE OR REPLACE FUNCTION __mj."spCreateActionCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20)
)
RETURNS SETOF __mj."vwActionCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionCategory"
            ("ID", "Name", "Description", "ParentID", "Status")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, COALESCE(p_Status, 'Pending'))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionCategory"
            ("Name", "Description", "ParentID", "Status")
        VALUES
            (p_Name, p_Description, p_ParentID, COALESCE(p_Status, 'Pending'))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateApplicationEntity
CREATE OR REPLACE FUNCTION __mj."spCreateApplicationEntity"(
    p_ID UUID DEFAULT NULL::UUID,
    p_ApplicationID UUID DEFAULT NULL::UUID,
    p_EntityID UUID DEFAULT NULL::UUID,
    p_Sequence INTEGER DEFAULT NULL::INTEGER,
    p_DefaultForNewUser BOOLEAN DEFAULT NULL::BOOLEAN
)
RETURNS SETOF __mj."vwApplicationEntities"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ApplicationEntity"
            ("ID", "ApplicationID", "EntityID", "Sequence", "DefaultForNewUser")
        VALUES
            (p_ID, p_ApplicationID, p_EntityID, p_Sequence, COALESCE(p_DefaultForNewUser, TRUE))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ApplicationEntity"
            ("ApplicationID", "EntityID", "Sequence", "DefaultForNewUser")
        VALUES
            (p_ApplicationID, p_EntityID, p_Sequence, COALESCE(p_DefaultForNewUser, TRUE))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = v_id;
END;
$function$;

-- spCreateArtifact
CREATE OR REPLACE FUNCTION __mj."spCreateArtifact"(
    p_ID UUID DEFAULT NULL::UUID,
    p_EnvironmentID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_TypeID UUID DEFAULT NULL::UUID,
    p_Comments TEXT DEFAULT NULL::TEXT,
    p_UserID UUID DEFAULT NULL::UUID,
    p_Visibility CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20)
)
RETURNS SETOF __mj."vwArtifacts"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Artifact"
            ("ID", "EnvironmentID", "Name", "Description", "TypeID", "Comments", "UserID", "Visibility")
        VALUES
            (p_ID, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_Name, p_Description, p_TypeID, p_Comments, p_UserID, COALESCE(p_Visibility, 'Always'))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Artifact"
            ("EnvironmentID", "Name", "Description", "TypeID", "Comments", "UserID", "Visibility")
        VALUES
            (COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_Name, p_Description, p_TypeID, p_Comments, p_UserID, COALESCE(p_Visibility, 'Always'))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwArtifacts" WHERE "ID" = v_id;
END;
$function$;

-- spCreateArtifactType
CREATE OR REPLACE FUNCTION __mj."spCreateArtifactType"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ContentType CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_IsEnabled BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_ExtractRules TEXT DEFAULT NULL::TEXT,
    p_DriverClass CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Icon CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255)
)
RETURNS SETOF __mj."vwArtifactTypes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ArtifactType"
            ("ID", "Name", "Description", "ContentType", "IsEnabled", "ParentID", "ExtractRules", "DriverClass", "Icon")
        VALUES
            (COALESCE(p_ID, gen_random_uuid()), p_Name, p_Description, p_ContentType, COALESCE(p_IsEnabled, TRUE), p_ParentID, p_ExtractRules, p_DriverClass, p_Icon)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ArtifactType"
            ("Name", "Description", "ContentType", "IsEnabled", "ParentID", "ExtractRules", "DriverClass", "Icon")
        VALUES
            (p_Name, p_Description, p_ContentType, COALESCE(p_IsEnabled, TRUE), p_ParentID, p_ExtractRules, p_DriverClass, p_Icon)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAuditLogType
CREATE OR REPLACE FUNCTION __mj."spCreateAuditLogType"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_AuthorizationID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwAuditLogTypes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AuditLogType"
            ("ID", "Name", "Description", "ParentID", "AuthorizationID")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_AuthorizationID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AuditLogType"
            ("Name", "Description", "ParentID", "AuthorizationID")
        VALUES
            (p_Name, p_Description, p_ParentID, p_AuthorizationID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAuditLogTypes" WHERE "ID" = v_id;
END;
$function$;

-- spCreateAuthorization
CREATE OR REPLACE FUNCTION __mj."spCreateAuthorization"(
    p_ID UUID DEFAULT NULL::UUID,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_IsActive BOOLEAN DEFAULT NULL::BOOLEAN,
    p_UseAuditLog BOOLEAN DEFAULT NULL::BOOLEAN,
    p_Description TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwAuthorizations"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Authorization"
            ("ID", "ParentID", "Name", "IsActive", "UseAuditLog", "Description")
        VALUES
            (p_ID, p_ParentID, p_Name, COALESCE(p_IsActive, TRUE), COALESCE(p_UseAuditLog, TRUE), p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Authorization"
            ("ParentID", "Name", "IsActive", "UseAuditLog", "Description")
        VALUES
            (p_ParentID, p_Name, COALESCE(p_IsActive, TRUE), COALESCE(p_UseAuditLog, TRUE), p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAuthorizations" WHERE "ID" = v_id;
END;
$function$;

-- spCreateCollection
CREATE OR REPLACE FUNCTION __mj."spCreateCollection"(
    p_ID UUID DEFAULT NULL::UUID,
    p_EnvironmentID UUID DEFAULT NULL::UUID,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_Icon CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_Color CHARACTER VARYING(7) DEFAULT NULL::CHARACTER VARYING(7),
    p_Sequence INTEGER DEFAULT NULL::INTEGER,
    p_OwnerID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwCollections"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Collection"
            ("ID", "EnvironmentID", "ParentID", "Name", "Description", "Icon", "Color", "Sequence", "OwnerID")
        VALUES
            (p_ID, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ParentID, p_Name, p_Description, p_Icon, p_Color, p_Sequence, p_OwnerID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Collection"
            ("EnvironmentID", "ParentID", "Name", "Description", "Icon", "Color", "Sequence", "OwnerID")
        VALUES
            (COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ParentID, p_Name, p_Description, p_Icon, p_Color, p_Sequence, p_OwnerID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCollections" WHERE "ID" = v_id;
END;
$function$;

-- spCreateConversation
CREATE OR REPLACE FUNCTION __mj."spCreateConversation"(
    p_ID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID,
    p_ExternalID CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_Type CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_IsArchived BOOLEAN DEFAULT NULL::BOOLEAN,
    p_LinkedEntityID UUID DEFAULT NULL::UUID,
    p_LinkedRecordID CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_DataContextID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_EnvironmentID UUID DEFAULT NULL::UUID,
    p_ProjectID UUID DEFAULT NULL::UUID,
    p_IsPinned BOOLEAN DEFAULT NULL::BOOLEAN,
    p_TestRunID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwConversations"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Conversation"
            ("ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID")
        VALUES
            (p_ID, p_UserID, p_ExternalID, p_Name, p_Description, COALESCE(p_Type, 'Skip'), COALESCE(p_IsArchived, FALSE), p_LinkedEntityID, p_LinkedRecordID, p_DataContextID, COALESCE(p_Status, 'Available'), COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ProjectID, COALESCE(p_IsPinned, FALSE), p_TestRunID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Conversation"
            ("UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID")
        VALUES
            (p_UserID, p_ExternalID, p_Name, p_Description, COALESCE(p_Type, 'Skip'), COALESCE(p_IsArchived, FALSE), p_LinkedEntityID, p_LinkedRecordID, p_DataContextID, COALESCE(p_Status, 'Available'), COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ProjectID, COALESCE(p_IsPinned, FALSE), p_TestRunID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE "ID" = v_id;
END;
$function$;

-- spCreateConversationDetail
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(
    p_ID UUID DEFAULT NULL::UUID,
    p_ConversationID UUID DEFAULT NULL::UUID,
    p_ExternalID CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Role CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_Message TEXT DEFAULT NULL::TEXT,
    p_Error TEXT DEFAULT NULL::TEXT,
    p_HiddenToUser BOOLEAN DEFAULT NULL::BOOLEAN,
    p_UserRating INTEGER DEFAULT NULL::INTEGER,
    p_UserFeedback TEXT DEFAULT NULL::TEXT,
    p_ReflectionInsights TEXT DEFAULT NULL::TEXT,
    p_SummaryOfEarlierConversation TEXT DEFAULT NULL::TEXT,
    p_UserID UUID DEFAULT NULL::UUID,
    p_ArtifactID UUID DEFAULT NULL::UUID,
    p_ArtifactVersionID UUID DEFAULT NULL::UUID,
    p_CompletionTime BIGINT DEFAULT NULL::BIGINT,
    p_IsPinned BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_AgentID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_SuggestedResponses TEXT DEFAULT NULL::TEXT,
    p_TestRunID UUID DEFAULT NULL::UUID,
    p_ResponseForm TEXT DEFAULT NULL::TEXT,
    p_ActionableCommands TEXT DEFAULT NULL::TEXT,
    p_AutomaticCommands TEXT DEFAULT NULL::TEXT,
    p_OriginalMessageChanged BOOLEAN DEFAULT NULL::BOOLEAN
)
RETURNS SETOF __mj."vwConversationDetails"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationDetail"
            ("ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged")
        VALUES
            (p_ID, p_ConversationID, p_ExternalID, COALESCE(p_Role, user_name()), p_Message, p_Error, COALESCE(p_HiddenToUser, FALSE), p_UserRating, p_UserFeedback, p_ReflectionInsights, p_SummaryOfEarlierConversation, p_UserID, p_ArtifactID, p_ArtifactVersionID, p_CompletionTime, COALESCE(p_IsPinned, FALSE), p_ParentID, p_AgentID, COALESCE(p_Status, 'Complete'), p_SuggestedResponses, p_TestRunID, p_ResponseForm, p_ActionableCommands, p_AutomaticCommands, COALESCE(p_OriginalMessageChanged, FALSE))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationDetail"
            ("ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged")
        VALUES
            (p_ConversationID, p_ExternalID, COALESCE(p_Role, user_name()), p_Message, p_Error, COALESCE(p_HiddenToUser, FALSE), p_UserRating, p_UserFeedback, p_ReflectionInsights, p_SummaryOfEarlierConversation, p_UserID, p_ArtifactID, p_ArtifactVersionID, p_CompletionTime, COALESCE(p_IsPinned, FALSE), p_ParentID, p_AgentID, COALESCE(p_Status, 'Complete'), p_SuggestedResponses, p_TestRunID, p_ResponseForm, p_ActionableCommands, p_AutomaticCommands, COALESCE(p_OriginalMessageChanged, FALSE))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE "ID" = v_id;
END;
$function$;

-- spCreateConversationDetailAttachment
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailAttachment"(
    p_ID UUID DEFAULT NULL::UUID,
    p_ConversationDetailID UUID DEFAULT NULL::UUID,
    p_ModalityID UUID DEFAULT NULL::UUID,
    p_MimeType CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_FileName CHARACTER VARYING(4000) DEFAULT NULL::CHARACTER VARYING(4000),
    p_FileSizeBytes INTEGER DEFAULT NULL::INTEGER,
    p_Width INTEGER DEFAULT NULL::INTEGER,
    p_Height INTEGER DEFAULT NULL::INTEGER,
    p_DurationSeconds INTEGER DEFAULT NULL::INTEGER,
    p_InlineData TEXT DEFAULT NULL::TEXT,
    p_FileID UUID DEFAULT NULL::UUID,
    p_DisplayOrder INTEGER DEFAULT NULL::INTEGER,
    p_ThumbnailBase64 TEXT DEFAULT NULL::TEXT,
    p_Description TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwConversationDetailAttachments"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationDetailAttachment"
            ("ID", "ConversationDetailID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "DisplayOrder", "ThumbnailBase64", "Description")
        VALUES
            (p_ID, p_ConversationDetailID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, COALESCE(p_DisplayOrder, 0), p_ThumbnailBase64, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationDetailAttachment"
            ("ConversationDetailID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "DisplayOrder", "ThumbnailBase64", "Description")
        VALUES
            (p_ConversationDetailID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, COALESCE(p_DisplayOrder, 0), p_ThumbnailBase64, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE "ID" = v_id;
END;
$function$;

-- spCreateCredentialCategory
CREATE OR REPLACE FUNCTION __mj."spCreateCredentialCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_IconClass CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100)
)
RETURNS SETOF __mj."vwCredentialCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CredentialCategory"
            ("ID", "Name", "Description", "ParentID", "IconClass")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_IconClass)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CredentialCategory"
            ("Name", "Description", "ParentID", "IconClass")
        VALUES
            (p_Name, p_Description, p_ParentID, p_IconClass)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCredentialCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateDashboard
CREATE OR REPLACE FUNCTION __mj."spCreateDashboard"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_UserID UUID DEFAULT NULL::UUID,
    p_CategoryID UUID DEFAULT NULL::UUID,
    p_UIConfigDetails TEXT DEFAULT NULL::TEXT,
    p_Type CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_Thumbnail TEXT DEFAULT NULL::TEXT,
    p_Scope CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ApplicationID UUID DEFAULT NULL::UUID,
    p_DriverClass CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Code CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_EnvironmentID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwDashboards"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Dashboard"
            ("ID", "Name", "Description", "UserID", "CategoryID", "UIConfigDetails", "Type", "Thumbnail", "Scope", "ApplicationID", "DriverClass", "Code", "EnvironmentID")
        VALUES
            (p_ID, p_Name, p_Description, p_UserID, p_CategoryID, p_UIConfigDetails, COALESCE(p_Type, 'Config'), p_Thumbnail, COALESCE(p_Scope, 'Global'), p_ApplicationID, p_DriverClass, p_Code, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Dashboard"
            ("Name", "Description", "UserID", "CategoryID", "UIConfigDetails", "Type", "Thumbnail", "Scope", "ApplicationID", "DriverClass", "Code", "EnvironmentID")
        VALUES
            (p_Name, p_Description, p_UserID, p_CategoryID, p_UIConfigDetails, COALESCE(p_Type, 'Config'), p_Thumbnail, COALESCE(p_Scope, 'Global'), p_ApplicationID, p_DriverClass, p_Code, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboards" WHERE "ID" = v_id;
END;
$function$;

-- spCreateDashboardCategory
CREATE OR REPLACE FUNCTION __mj."spCreateDashboardCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwDashboardCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DashboardCategory"
            ("ID", "Name", "Description", "ParentID", "UserID")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DashboardCategory"
            ("Name", "Description", "ParentID", "UserID")
        VALUES
            (p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboardCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateEntity
CREATE OR REPLACE FUNCTION __mj."spCreateEntity"(
    p_ID UUID DEFAULT NULL::UUID,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_NameSuffix CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_AutoUpdateDescription BOOLEAN DEFAULT NULL::BOOLEAN,
    p_BaseView CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_BaseViewGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_VirtualEntity BOOLEAN DEFAULT NULL::BOOLEAN,
    p_TrackRecordChanges BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AuditRecordAccess BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AuditViewRuns BOOLEAN DEFAULT NULL::BOOLEAN,
    p_IncludeInAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AllowAllRowsAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AllowUpdateAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AllowCreateAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AllowDeleteAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CustomResolverAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AllowUserSearchAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_FullTextSearchEnabled BOOLEAN DEFAULT NULL::BOOLEAN,
    p_FullTextCatalog CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_FullTextCatalogGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_FullTextIndex CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_FullTextIndexGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_FullTextSearchFunction CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_FullTextSearchFunctionGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_UserViewMaxRows INTEGER DEFAULT NULL::INTEGER,
    p_spCreate CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_spUpdate CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_spDelete CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_spCreateGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_spUpdateGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_spDeleteGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_CascadeDeletes BOOLEAN DEFAULT NULL::BOOLEAN,
    p_DeleteType CHARACTER VARYING(10) DEFAULT NULL::CHARACTER VARYING(10),
    p_AllowRecordMerge BOOLEAN DEFAULT NULL::BOOLEAN,
    p_spMatch CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_RelationshipDefaultDisplayType CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_UserFormGenerated BOOLEAN DEFAULT NULL::BOOLEAN,
    p_EntityObjectSubclassName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_EntityObjectSubclassImport CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_PreferredCommunicationField CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Icon CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_ScopeDefault CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_RowsToPackWithSchema CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_RowsToPackSampleMethod CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_RowsToPackSampleCount INTEGER DEFAULT NULL::INTEGER,
    p_RowsToPackSampleOrder TEXT DEFAULT NULL::TEXT,
    p_AutoRowCountFrequency INTEGER DEFAULT NULL::INTEGER,
    p_RowCount BIGINT DEFAULT NULL::BIGINT,
    p_RowCountRunAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_Status CHARACTER VARYING(25) DEFAULT NULL::CHARACTER VARYING(25),
    p_DisplayName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255)
)
RETURNS SETOF __mj."vwEntities"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Entity"
            ("ID", "ParentID", "Name", "NameSuffix", "Description", "AutoUpdateDescription", "BaseView", "BaseViewGenerated", "VirtualEntity", "TrackRecordChanges", "AuditRecordAccess", "AuditViewRuns", "IncludeInAPI", "AllowAllRowsAPI", "AllowUpdateAPI", "AllowCreateAPI", "AllowDeleteAPI", "CustomResolverAPI", "AllowUserSearchAPI", "FullTextSearchEnabled", "FullTextCatalog", "FullTextCatalogGenerated", "FullTextIndex", "FullTextIndexGenerated", "FullTextSearchFunction", "FullTextSearchFunctionGenerated", "UserViewMaxRows", "spCreate", "spUpdate", "spDelete", "spCreateGenerated", "spUpdateGenerated", "spDeleteGenerated", "CascadeDeletes", "DeleteType", "AllowRecordMerge", "spMatch", "RelationshipDefaultDisplayType", "UserFormGenerated", "EntityObjectSubclassName", "EntityObjectSubclassImport", "PreferredCommunicationField", "Icon", "ScopeDefault", "RowsToPackWithSchema", "RowsToPackSampleMethod", "RowsToPackSampleCount", "RowsToPackSampleOrder", "AutoRowCountFrequency", "RowCount", "RowCountRunAt", "Status", "DisplayName")
        VALUES
            (p_ID, p_ParentID, p_Name, p_NameSuffix, p_Description, COALESCE(p_AutoUpdateDescription, TRUE), p_BaseView, COALESCE(p_BaseViewGenerated, TRUE), COALESCE(p_VirtualEntity, FALSE), COALESCE(p_TrackRecordChanges, TRUE), COALESCE(p_AuditRecordAccess, TRUE), COALESCE(p_AuditViewRuns, TRUE), COALESCE(p_IncludeInAPI, FALSE), COALESCE(p_AllowAllRowsAPI, FALSE), COALESCE(p_AllowUpdateAPI, FALSE), COALESCE(p_AllowCreateAPI, FALSE), COALESCE(p_AllowDeleteAPI, FALSE), COALESCE(p_CustomResolverAPI, FALSE), COALESCE(p_AllowUserSearchAPI, FALSE), COALESCE(p_FullTextSearchEnabled, FALSE), p_FullTextCatalog, COALESCE(p_FullTextCatalogGenerated, TRUE), p_FullTextIndex, COALESCE(p_FullTextIndexGenerated, TRUE), p_FullTextSearchFunction, COALESCE(p_FullTextSearchFunctionGenerated, TRUE), p_UserViewMaxRows, p_spCreate, p_spUpdate, p_spDelete, COALESCE(p_spCreateGenerated, TRUE), COALESCE(p_spUpdateGenerated, TRUE), COALESCE(p_spDeleteGenerated, TRUE), COALESCE(p_CascadeDeletes, FALSE), COALESCE(p_DeleteType, 'Hard'), COALESCE(p_AllowRecordMerge, FALSE), p_spMatch, COALESCE(p_RelationshipDefaultDisplayType, 'Search'), COALESCE(p_UserFormGenerated, TRUE), p_EntityObjectSubclassName, p_EntityObjectSubclassImport, p_PreferredCommunicationField, p_Icon, p_ScopeDefault, COALESCE(p_RowsToPackWithSchema, 'None'), COALESCE(p_RowsToPackSampleMethod, 'random'), COALESCE(p_RowsToPackSampleCount, 0), p_RowsToPackSampleOrder, p_AutoRowCountFrequency, p_RowCount, p_RowCountRunAt, COALESCE(p_Status, 'Active'), p_DisplayName)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Entity"
            ("ParentID", "Name", "NameSuffix", "Description", "AutoUpdateDescription", "BaseView", "BaseViewGenerated", "VirtualEntity", "TrackRecordChanges", "AuditRecordAccess", "AuditViewRuns", "IncludeInAPI", "AllowAllRowsAPI", "AllowUpdateAPI", "AllowCreateAPI", "AllowDeleteAPI", "CustomResolverAPI", "AllowUserSearchAPI", "FullTextSearchEnabled", "FullTextCatalog", "FullTextCatalogGenerated", "FullTextIndex", "FullTextIndexGenerated", "FullTextSearchFunction", "FullTextSearchFunctionGenerated", "UserViewMaxRows", "spCreate", "spUpdate", "spDelete", "spCreateGenerated", "spUpdateGenerated", "spDeleteGenerated", "CascadeDeletes", "DeleteType", "AllowRecordMerge", "spMatch", "RelationshipDefaultDisplayType", "UserFormGenerated", "EntityObjectSubclassName", "EntityObjectSubclassImport", "PreferredCommunicationField", "Icon", "ScopeDefault", "RowsToPackWithSchema", "RowsToPackSampleMethod", "RowsToPackSampleCount", "RowsToPackSampleOrder", "AutoRowCountFrequency", "RowCount", "RowCountRunAt", "Status", "DisplayName")
        VALUES
            (p_ParentID, p_Name, p_NameSuffix, p_Description, COALESCE(p_AutoUpdateDescription, TRUE), p_BaseView, COALESCE(p_BaseViewGenerated, TRUE), COALESCE(p_VirtualEntity, FALSE), COALESCE(p_TrackRecordChanges, TRUE), COALESCE(p_AuditRecordAccess, TRUE), COALESCE(p_AuditViewRuns, TRUE), COALESCE(p_IncludeInAPI, FALSE), COALESCE(p_AllowAllRowsAPI, FALSE), COALESCE(p_AllowUpdateAPI, FALSE), COALESCE(p_AllowCreateAPI, FALSE), COALESCE(p_AllowDeleteAPI, FALSE), COALESCE(p_CustomResolverAPI, FALSE), COALESCE(p_AllowUserSearchAPI, FALSE), COALESCE(p_FullTextSearchEnabled, FALSE), p_FullTextCatalog, COALESCE(p_FullTextCatalogGenerated, TRUE), p_FullTextIndex, COALESCE(p_FullTextIndexGenerated, TRUE), p_FullTextSearchFunction, COALESCE(p_FullTextSearchFunctionGenerated, TRUE), p_UserViewMaxRows, p_spCreate, p_spUpdate, p_spDelete, COALESCE(p_spCreateGenerated, TRUE), COALESCE(p_spUpdateGenerated, TRUE), COALESCE(p_spDeleteGenerated, TRUE), COALESCE(p_CascadeDeletes, FALSE), COALESCE(p_DeleteType, 'Hard'), COALESCE(p_AllowRecordMerge, FALSE), p_spMatch, COALESCE(p_RelationshipDefaultDisplayType, 'Search'), COALESCE(p_UserFormGenerated, TRUE), p_EntityObjectSubclassName, p_EntityObjectSubclassImport, p_PreferredCommunicationField, p_Icon, p_ScopeDefault, COALESCE(p_RowsToPackWithSchema, 'None'), COALESCE(p_RowsToPackSampleMethod, 'random'), COALESCE(p_RowsToPackSampleCount, 0), p_RowsToPackSampleOrder, p_AutoRowCountFrequency, p_RowCount, p_RowCountRunAt, COALESCE(p_Status, 'Active'), p_DisplayName)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE "ID" = v_id;
END;
$function$;

-- spCreateEntityField
CREATE OR REPLACE FUNCTION __mj."spCreateEntityField"(
    p_ID UUID DEFAULT NULL::UUID,
    p_DisplayName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_AutoUpdateDescription BOOLEAN DEFAULT NULL::BOOLEAN,
    p_IsPrimaryKey BOOLEAN DEFAULT NULL::BOOLEAN,
    p_IsUnique BOOLEAN DEFAULT NULL::BOOLEAN,
    p_Category CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_ValueListType CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ExtendedType CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_CodeType CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_DefaultInView BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ViewCellTemplate TEXT DEFAULT NULL::TEXT,
    p_DefaultColumnWidth INTEGER DEFAULT NULL::INTEGER,
    p_AllowUpdateAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AllowUpdateInView BOOLEAN DEFAULT NULL::BOOLEAN,
    p_IncludeInUserSearchAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_FullTextSearchEnabled BOOLEAN DEFAULT NULL::BOOLEAN,
    p_UserSearchParamFormatAPI CHARACTER VARYING(500) DEFAULT NULL::CHARACTER VARYING(500),
    p_IncludeInGeneratedForm BOOLEAN DEFAULT NULL::BOOLEAN,
    p_GeneratedFormSection CHARACTER VARYING(10) DEFAULT NULL::CHARACTER VARYING(10),
    p_IsNameField BOOLEAN DEFAULT NULL::BOOLEAN,
    p_RelatedEntityID UUID DEFAULT NULL::UUID,
    p_RelatedEntityFieldName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN DEFAULT NULL::BOOLEAN,
    p_RelatedEntityNameFieldMap CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_RelatedEntityDisplayType CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_EntityIDFieldName CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_ScopeDefault CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_AutoUpdateRelatedEntityInfo BOOLEAN DEFAULT NULL::BOOLEAN,
    p_ValuesToPackWithSchema CHARACTER VARYING(10) DEFAULT NULL::CHARACTER VARYING(10),
    p_Status CHARACTER VARYING(25) DEFAULT NULL::CHARACTER VARYING(25),
    p_AutoUpdateIsNameField BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AutoUpdateDefaultInView BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AutoUpdateCategory BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AutoUpdateDisplayName BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AutoUpdateIncludeInUserSearchAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_Encrypt BOOLEAN DEFAULT NULL::BOOLEAN,
    p_EncryptionKeyID UUID DEFAULT NULL::UUID,
    p_AllowDecryptInAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_SendEncryptedValue BOOLEAN DEFAULT NULL::BOOLEAN,
    p_IsSoftPrimaryKey BOOLEAN DEFAULT NULL::BOOLEAN,
    p_IsSoftForeignKey BOOLEAN DEFAULT NULL::BOOLEAN,
    p_RelatedEntityJoinFields TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwEntityFields"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityField"
            ("ID", "DisplayName", "Description", "AutoUpdateDescription", "IsPrimaryKey", "IsUnique", "Category", "ValueListType", "ExtendedType", "CodeType", "DefaultInView", "ViewCellTemplate", "DefaultColumnWidth", "AllowUpdateAPI", "AllowUpdateInView", "IncludeInUserSearchAPI", "FullTextSearchEnabled", "UserSearchParamFormatAPI", "IncludeInGeneratedForm", "GeneratedFormSection", "IsNameField", "RelatedEntityID", "RelatedEntityFieldName", "IncludeRelatedEntityNameFieldInBaseView", "RelatedEntityNameFieldMap", "RelatedEntityDisplayType", "EntityIDFieldName", "ScopeDefault", "AutoUpdateRelatedEntityInfo", "ValuesToPackWithSchema", "Status", "AutoUpdateIsNameField", "AutoUpdateDefaultInView", "AutoUpdateCategory", "AutoUpdateDisplayName", "AutoUpdateIncludeInUserSearchAPI", "Encrypt", "EncryptionKeyID", "AllowDecryptInAPI", "SendEncryptedValue", "IsSoftPrimaryKey", "IsSoftForeignKey", "RelatedEntityJoinFields")
        VALUES
            (p_ID, p_DisplayName, p_Description, COALESCE(p_AutoUpdateDescription, TRUE), COALESCE(p_IsPrimaryKey, FALSE), COALESCE(p_IsUnique, FALSE), p_Category, COALESCE(p_ValueListType, 'None'), p_ExtendedType, p_CodeType, COALESCE(p_DefaultInView, FALSE), p_ViewCellTemplate, p_DefaultColumnWidth, COALESCE(p_AllowUpdateAPI, TRUE), COALESCE(p_AllowUpdateInView, TRUE), COALESCE(p_IncludeInUserSearchAPI, FALSE), COALESCE(p_FullTextSearchEnabled, FALSE), p_UserSearchParamFormatAPI, COALESCE(p_IncludeInGeneratedForm, TRUE), COALESCE(p_GeneratedFormSection, 'Details'), COALESCE(p_IsNameField, FALSE), p_RelatedEntityID, p_RelatedEntityFieldName, COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE), p_RelatedEntityNameFieldMap, COALESCE(p_RelatedEntityDisplayType, 'Search'), p_EntityIDFieldName, p_ScopeDefault, COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE), COALESCE(p_ValuesToPackWithSchema, 'Auto'), COALESCE(p_Status, 'Active'), COALESCE(p_AutoUpdateIsNameField, TRUE), COALESCE(p_AutoUpdateDefaultInView, TRUE), COALESCE(p_AutoUpdateCategory, TRUE), COALESCE(p_AutoUpdateDisplayName, TRUE), COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE), COALESCE(p_Encrypt, FALSE), p_EncryptionKeyID, COALESCE(p_AllowDecryptInAPI, FALSE), COALESCE(p_SendEncryptedValue, FALSE), COALESCE(p_IsSoftPrimaryKey, FALSE), COALESCE(p_IsSoftForeignKey, FALSE), p_RelatedEntityJoinFields)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityField"
            ("DisplayName", "Description", "AutoUpdateDescription", "IsPrimaryKey", "IsUnique", "Category", "ValueListType", "ExtendedType", "CodeType", "DefaultInView", "ViewCellTemplate", "DefaultColumnWidth", "AllowUpdateAPI", "AllowUpdateInView", "IncludeInUserSearchAPI", "FullTextSearchEnabled", "UserSearchParamFormatAPI", "IncludeInGeneratedForm", "GeneratedFormSection", "IsNameField", "RelatedEntityID", "RelatedEntityFieldName", "IncludeRelatedEntityNameFieldInBaseView", "RelatedEntityNameFieldMap", "RelatedEntityDisplayType", "EntityIDFieldName", "ScopeDefault", "AutoUpdateRelatedEntityInfo", "ValuesToPackWithSchema", "Status", "AutoUpdateIsNameField", "AutoUpdateDefaultInView", "AutoUpdateCategory", "AutoUpdateDisplayName", "AutoUpdateIncludeInUserSearchAPI", "Encrypt", "EncryptionKeyID", "AllowDecryptInAPI", "SendEncryptedValue", "IsSoftPrimaryKey", "IsSoftForeignKey", "RelatedEntityJoinFields")
        VALUES
            (p_DisplayName, p_Description, COALESCE(p_AutoUpdateDescription, TRUE), COALESCE(p_IsPrimaryKey, FALSE), COALESCE(p_IsUnique, FALSE), p_Category, COALESCE(p_ValueListType, 'None'), p_ExtendedType, p_CodeType, COALESCE(p_DefaultInView, FALSE), p_ViewCellTemplate, p_DefaultColumnWidth, COALESCE(p_AllowUpdateAPI, TRUE), COALESCE(p_AllowUpdateInView, TRUE), COALESCE(p_IncludeInUserSearchAPI, FALSE), COALESCE(p_FullTextSearchEnabled, FALSE), p_UserSearchParamFormatAPI, COALESCE(p_IncludeInGeneratedForm, TRUE), COALESCE(p_GeneratedFormSection, 'Details'), COALESCE(p_IsNameField, FALSE), p_RelatedEntityID, p_RelatedEntityFieldName, COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE), p_RelatedEntityNameFieldMap, COALESCE(p_RelatedEntityDisplayType, 'Search'), p_EntityIDFieldName, p_ScopeDefault, COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE), COALESCE(p_ValuesToPackWithSchema, 'Auto'), COALESCE(p_Status, 'Active'), COALESCE(p_AutoUpdateIsNameField, TRUE), COALESCE(p_AutoUpdateDefaultInView, TRUE), COALESCE(p_AutoUpdateCategory, TRUE), COALESCE(p_AutoUpdateDisplayName, TRUE), COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE), COALESCE(p_Encrypt, FALSE), p_EncryptionKeyID, COALESCE(p_AllowDecryptInAPI, FALSE), COALESCE(p_SendEncryptedValue, FALSE), COALESCE(p_IsSoftPrimaryKey, FALSE), COALESCE(p_IsSoftForeignKey, FALSE), p_RelatedEntityJoinFields)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = v_id;
END;
$function$;

-- spCreateEntityFieldValue
CREATE OR REPLACE FUNCTION __mj."spCreateEntityFieldValue"(
    p_ID UUID DEFAULT NULL::UUID,
    p_EntityFieldID UUID DEFAULT NULL::UUID,
    p_Sequence INTEGER DEFAULT NULL::INTEGER,
    p_Value CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Code CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_Description TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwEntityFieldValues"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityFieldValue"
            ("ID", "EntityFieldID", "Sequence", "Value", "Code", "Description")
        VALUES
            (p_ID, p_EntityFieldID, p_Sequence, p_Value, p_Code, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityFieldValue"
            ("EntityFieldID", "Sequence", "Value", "Code", "Description")
        VALUES
            (p_EntityFieldID, p_Sequence, p_Value, p_Code, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = v_id;
END;
$function$;

-- spCreateEntityRelationship
CREATE OR REPLACE FUNCTION __mj."spCreateEntityRelationship"(
    p_ID UUID DEFAULT NULL::UUID,
    p_EntityID UUID DEFAULT NULL::UUID,
    p_Sequence INTEGER DEFAULT NULL::INTEGER,
    p_RelatedEntityID UUID DEFAULT NULL::UUID,
    p_BundleInAPI BOOLEAN DEFAULT NULL::BOOLEAN,
    p_IncludeInParentAllQuery BOOLEAN DEFAULT NULL::BOOLEAN,
    p_Type CHARACTER(20) DEFAULT NULL::CHARACTER(20),
    p_EntityKeyField CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_RelatedEntityJoinField CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_JoinView CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_JoinEntityJoinField CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_JoinEntityInverseJoinField CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_DisplayInForm BOOLEAN DEFAULT NULL::BOOLEAN,
    p_DisplayLocation CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_DisplayName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_DisplayIconType CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_DisplayIcon CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_DisplayComponentID UUID DEFAULT NULL::UUID,
    p_DisplayComponentConfiguration TEXT DEFAULT NULL::TEXT,
    p_AutoUpdateFromSchema BOOLEAN DEFAULT NULL::BOOLEAN,
    p_AdditionalFieldsToInclude TEXT DEFAULT NULL::TEXT,
    p_AutoUpdateAdditionalFieldsToInclude BOOLEAN DEFAULT NULL::BOOLEAN
)
RETURNS SETOF __mj."vwEntityRelationships"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityRelationship"
            ("ID", "EntityID", "Sequence", "RelatedEntityID", "BundleInAPI", "IncludeInParentAllQuery", "Type", "EntityKeyField", "RelatedEntityJoinField", "JoinView", "JoinEntityJoinField", "JoinEntityInverseJoinField", "DisplayInForm", "DisplayLocation", "DisplayName", "DisplayIconType", "DisplayIcon", "DisplayComponentID", "DisplayComponentConfiguration", "AutoUpdateFromSchema", "AdditionalFieldsToInclude", "AutoUpdateAdditionalFieldsToInclude")
        VALUES
            (p_ID, p_EntityID, COALESCE(p_Sequence, 0), p_RelatedEntityID, COALESCE(p_BundleInAPI, TRUE), COALESCE(p_IncludeInParentAllQuery, FALSE), COALESCE(p_Type, 'One To Many'), p_EntityKeyField, p_RelatedEntityJoinField, p_JoinView, p_JoinEntityJoinField, p_JoinEntityInverseJoinField, COALESCE(p_DisplayInForm, TRUE), COALESCE(p_DisplayLocation, 'After Field Tabs'), p_DisplayName, COALESCE(p_DisplayIconType, 'Related Entity Icon'), p_DisplayIcon, p_DisplayComponentID, p_DisplayComponentConfiguration, COALESCE(p_AutoUpdateFromSchema, TRUE), p_AdditionalFieldsToInclude, COALESCE(p_AutoUpdateAdditionalFieldsToInclude, TRUE))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityRelationship"
            ("EntityID", "Sequence", "RelatedEntityID", "BundleInAPI", "IncludeInParentAllQuery", "Type", "EntityKeyField", "RelatedEntityJoinField", "JoinView", "JoinEntityJoinField", "JoinEntityInverseJoinField", "DisplayInForm", "DisplayLocation", "DisplayName", "DisplayIconType", "DisplayIcon", "DisplayComponentID", "DisplayComponentConfiguration", "AutoUpdateFromSchema", "AdditionalFieldsToInclude", "AutoUpdateAdditionalFieldsToInclude")
        VALUES
            (p_EntityID, COALESCE(p_Sequence, 0), p_RelatedEntityID, COALESCE(p_BundleInAPI, TRUE), COALESCE(p_IncludeInParentAllQuery, FALSE), COALESCE(p_Type, 'One To Many'), p_EntityKeyField, p_RelatedEntityJoinField, p_JoinView, p_JoinEntityJoinField, p_JoinEntityInverseJoinField, COALESCE(p_DisplayInForm, TRUE), COALESCE(p_DisplayLocation, 'After Field Tabs'), p_DisplayName, COALESCE(p_DisplayIconType, 'Related Entity Icon'), p_DisplayIcon, p_DisplayComponentID, p_DisplayComponentConfiguration, COALESCE(p_AutoUpdateFromSchema, TRUE), p_AdditionalFieldsToInclude, COALESCE(p_AutoUpdateAdditionalFieldsToInclude, TRUE))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE "ID" = v_id;
END;
$function$;

-- spCreateErrorLog
CREATE OR REPLACE FUNCTION __mj."spCreateErrorLog"(
    p_ID UUID DEFAULT NULL::UUID,
    p_CompanyIntegrationRunID UUID DEFAULT NULL::UUID,
    p_CompanyIntegrationRunDetailID UUID DEFAULT NULL::UUID,
    p_Code CHARACTER(20) DEFAULT NULL::CHARACTER(20),
    p_Message TEXT DEFAULT NULL::TEXT,
    p_CreatedBy CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_Status CHARACTER VARYING(10) DEFAULT NULL::CHARACTER VARYING(10),
    p_Category CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_Details TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwErrorLogs"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ErrorLog"
            ("ID", "CompanyIntegrationRunID", "CompanyIntegrationRunDetailID", "Code", "Message", "CreatedBy", "Status", "Category", "Details")
        VALUES
            (p_ID, p_CompanyIntegrationRunID, p_CompanyIntegrationRunDetailID, p_Code, p_Message, p_CreatedBy, p_Status, p_Category, p_Details)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ErrorLog"
            ("CompanyIntegrationRunID", "CompanyIntegrationRunDetailID", "Code", "Message", "CreatedBy", "Status", "Category", "Details")
        VALUES
            (p_CompanyIntegrationRunID, p_CompanyIntegrationRunDetailID, p_Code, p_Message, p_CreatedBy, p_Status, p_Category, p_Details)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwErrorLogs" WHERE "ID" = v_id;
END;
$function$;

-- spCreateFileCategory
CREATE OR REPLACE FUNCTION __mj."spCreateFileCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Description TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwFileCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."FileCategory"
            ("ID", "Name", "ParentID", "Description")
        VALUES
            (p_ID, p_Name, p_ParentID, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."FileCategory"
            ("Name", "ParentID", "Description")
        VALUES
            (p_Name, p_ParentID, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwFileCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateGeneratedCodeCategory
CREATE OR REPLACE FUNCTION __mj."spCreateGeneratedCodeCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwGeneratedCodeCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."GeneratedCodeCategory"
            ("ID", "Name", "Description", "ParentID")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."GeneratedCodeCategory"
            ("Name", "Description", "ParentID")
        VALUES
            (p_Name, p_Description, p_ParentID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwGeneratedCodeCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateListCategory
CREATE OR REPLACE FUNCTION __mj."spCreateListCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwListCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ListCategory"
            ("ID", "Name", "Description", "ParentID", "UserID")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ListCategory"
            ("Name", "Description", "ParentID", "UserID")
        VALUES
            (p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwListCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateProject
CREATE OR REPLACE FUNCTION __mj."spCreateProject"(
    p_ID UUID DEFAULT NULL::UUID,
    p_EnvironmentID UUID DEFAULT NULL::UUID,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_Color CHARACTER VARYING(7) DEFAULT NULL::CHARACTER VARYING(7),
    p_Icon CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_IsArchived BOOLEAN DEFAULT NULL::BOOLEAN
)
RETURNS SETOF __mj."vwProjects"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Project"
            ("ID", "EnvironmentID", "ParentID", "Name", "Description", "Color", "Icon", "IsArchived")
        VALUES
            (p_ID, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ParentID, p_Name, p_Description, p_Color, p_Icon, COALESCE(p_IsArchived, FALSE))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Project"
            ("EnvironmentID", "ParentID", "Name", "Description", "Color", "Icon", "IsArchived")
        VALUES
            (COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ParentID, p_Name, p_Description, p_Color, p_Icon, COALESCE(p_IsArchived, FALSE))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwProjects" WHERE "ID" = v_id;
END;
$function$;

-- spCreateQueryCategory
CREATE OR REPLACE FUNCTION __mj."spCreateQueryCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Description TEXT DEFAULT NULL::TEXT,
    p_UserID UUID DEFAULT NULL::UUID,
    p_DefaultCacheEnabled BOOLEAN DEFAULT NULL::BOOLEAN,
    p_DefaultCacheTTLMinutes INTEGER DEFAULT NULL::INTEGER,
    p_DefaultCacheMaxSize INTEGER DEFAULT NULL::INTEGER,
    p_CacheInheritanceEnabled BOOLEAN DEFAULT NULL::BOOLEAN
)
RETURNS SETOF __mj."vwQueryCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueryCategory"
            ("ID", "Name", "ParentID", "Description", "UserID", "DefaultCacheEnabled", "DefaultCacheTTLMinutes", "DefaultCacheMaxSize", "CacheInheritanceEnabled")
        VALUES
            (p_ID, p_Name, p_ParentID, p_Description, p_UserID, COALESCE(p_DefaultCacheEnabled, FALSE), p_DefaultCacheTTLMinutes, p_DefaultCacheMaxSize, COALESCE(p_CacheInheritanceEnabled, TRUE))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueryCategory"
            ("Name", "ParentID", "Description", "UserID", "DefaultCacheEnabled", "DefaultCacheTTLMinutes", "DefaultCacheMaxSize", "CacheInheritanceEnabled")
        VALUES
            (p_Name, p_ParentID, p_Description, p_UserID, COALESCE(p_DefaultCacheEnabled, FALSE), p_DefaultCacheTTLMinutes, p_DefaultCacheMaxSize, COALESCE(p_CacheInheritanceEnabled, TRUE))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueryCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateReport
CREATE OR REPLACE FUNCTION __mj."spCreateReport"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_CategoryID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID,
    p_SharingScope CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_ConversationID UUID DEFAULT NULL::UUID,
    p_ConversationDetailID UUID DEFAULT NULL::UUID,
    p_DataContextID UUID DEFAULT NULL::UUID,
    p_Configuration TEXT DEFAULT NULL::TEXT,
    p_OutputTriggerTypeID UUID DEFAULT NULL::UUID,
    p_OutputFormatTypeID UUID DEFAULT NULL::UUID,
    p_OutputDeliveryTypeID UUID DEFAULT NULL::UUID,
    p_OutputFrequency CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_OutputTargetEmail CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_OutputWorkflowID UUID DEFAULT NULL::UUID,
    p_Thumbnail TEXT DEFAULT NULL::TEXT,
    p_EnvironmentID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwReports"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Report"
            ("ID", "Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID")
        VALUES
            (p_ID, p_Name, p_Description, p_CategoryID, p_UserID, COALESCE(p_SharingScope, 'Personal'), p_ConversationID, p_ConversationDetailID, p_DataContextID, p_Configuration, p_OutputTriggerTypeID, p_OutputFormatTypeID, p_OutputDeliveryTypeID, p_OutputFrequency, p_OutputTargetEmail, p_OutputWorkflowID, p_Thumbnail, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Report"
            ("Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID")
        VALUES
            (p_Name, p_Description, p_CategoryID, p_UserID, COALESCE(p_SharingScope, 'Personal'), p_ConversationID, p_ConversationDetailID, p_DataContextID, p_Configuration, p_OutputTriggerTypeID, p_OutputFormatTypeID, p_OutputDeliveryTypeID, p_OutputFrequency, p_OutputTargetEmail, p_OutputWorkflowID, p_Thumbnail, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwReports" WHERE "ID" = v_id;
END;
$function$;

-- spCreateReportCategory
CREATE OR REPLACE FUNCTION __mj."spCreateReportCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwReportCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ReportCategory"
            ("ID", "Name", "Description", "ParentID", "UserID")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ReportCategory"
            ("Name", "Description", "ParentID", "UserID")
        VALUES
            (p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwReportCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateSkill
CREATE OR REPLACE FUNCTION __mj."spCreateSkill"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_ParentID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwSkills"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Skill"
            ("ID", "Name", "ParentID")
        VALUES
            (p_ID, p_Name, p_ParentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Skill"
            ("Name", "ParentID")
        VALUES
            (p_Name, p_ParentID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwSkills" WHERE "ID" = v_id;
END;
$function$;

-- spCreateTag
CREATE OR REPLACE FUNCTION __mj."spCreateTag"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_DisplayName CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwTags"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Tag"
            ("ID", "Name", "ParentID", "DisplayName", "Description")
        VALUES
            (p_ID, p_Name, p_ParentID, p_DisplayName, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Tag"
            ("Name", "ParentID", "DisplayName", "Description")
        VALUES
            (p_Name, p_ParentID, p_DisplayName, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTags" WHERE "ID" = v_id;
END;
$function$;

-- spCreateTask
CREATE OR REPLACE FUNCTION __mj."spCreateTask"(
    p_ID UUID DEFAULT NULL::UUID,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_TypeID UUID DEFAULT NULL::UUID,
    p_EnvironmentID UUID DEFAULT NULL::UUID,
    p_ProjectID UUID DEFAULT NULL::UUID,
    p_ConversationDetailID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID,
    p_AgentID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_PercentComplete INTEGER DEFAULT NULL::INTEGER,
    p_DueAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_StartedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ,
    p_CompletedAt TIMESTAMPTZ DEFAULT NULL::TIMESTAMPTZ
)
RETURNS SETOF __mj."vwTasks"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Task"
            ("ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt")
        VALUES
            (p_ID, p_ParentID, p_Name, p_Description, p_TypeID, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ProjectID, p_ConversationDetailID, p_UserID, p_AgentID, COALESCE(p_Status, 'Pending'), p_PercentComplete, p_DueAt, p_StartedAt, p_CompletedAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Task"
            ("ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt")
        VALUES
            (p_ParentID, p_Name, p_Description, p_TypeID, COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09'), p_ProjectID, p_ConversationDetailID, p_UserID, p_AgentID, COALESCE(p_Status, 'Pending'), p_PercentComplete, p_DueAt, p_StartedAt, p_CompletedAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTasks" WHERE "ID" = v_id;
END;
$function$;

-- spCreateTemplateCategory
CREATE OR REPLACE FUNCTION __mj."spCreateTemplateCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwTemplateCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TemplateCategory"
            ("ID", "Name", "Description", "ParentID", "UserID")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TemplateCategory"
            ("Name", "Description", "ParentID", "UserID")
        VALUES
            (p_Name, p_Description, p_ParentID, p_UserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTemplateCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateTestSuite
CREATE OR REPLACE FUNCTION __mj."spCreateTestSuite"(
    p_ID UUID DEFAULT NULL::UUID,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(255) DEFAULT NULL::CHARACTER VARYING(255),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_Status CHARACTER VARYING(20) DEFAULT NULL::CHARACTER VARYING(20),
    p_Tags TEXT DEFAULT NULL::TEXT,
    p_Configuration TEXT DEFAULT NULL::TEXT,
    p_MaxExecutionTimeMS INTEGER DEFAULT NULL::INTEGER,
    p_Variables TEXT DEFAULT NULL::TEXT
)
RETURNS SETOF __mj."vwTestSuites"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestSuite"
            ("ID", "ParentID", "Name", "Description", "Status", "Tags", "Configuration", "MaxExecutionTimeMS", "Variables")
        VALUES
            (p_ID, p_ParentID, p_Name, p_Description, COALESCE(p_Status, 'Active'), p_Tags, p_Configuration, p_MaxExecutionTimeMS, p_Variables)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestSuite"
            ("ParentID", "Name", "Description", "Status", "Tags", "Configuration", "MaxExecutionTimeMS", "Variables")
        VALUES
            (p_ParentID, p_Name, p_Description, COALESCE(p_Status, 'Active'), p_Tags, p_Configuration, p_MaxExecutionTimeMS, p_Variables)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestSuites" WHERE "ID" = v_id;
END;
$function$;

-- spCreateUserFavorite
CREATE OR REPLACE FUNCTION __mj."spCreateUserFavorite"(
    p_ID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID,
    p_EntityID UUID DEFAULT NULL::UUID,
    p_RecordID CHARACTER VARYING(450) DEFAULT NULL::CHARACTER VARYING(450)
)
RETURNS SETOF __mj."vwUserFavorites"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserFavorite"
            ("ID", "UserID", "EntityID", "RecordID")
        VALUES
            (p_ID, p_UserID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserFavorite"
            ("UserID", "EntityID", "RecordID")
        VALUES
            (p_UserID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserFavorites" WHERE "ID" = v_id;
END;
$function$;

-- spCreateUserViewCategory
CREATE OR REPLACE FUNCTION __mj."spCreateUserViewCategory"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(100) DEFAULT NULL::CHARACTER VARYING(100),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_ParentID UUID DEFAULT NULL::UUID,
    p_EntityID UUID DEFAULT NULL::UUID,
    p_UserID UUID DEFAULT NULL::UUID
)
RETURNS SETOF __mj."vwUserViewCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserViewCategory"
            ("ID", "Name", "Description", "ParentID", "EntityID", "UserID")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_EntityID, p_UserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserViewCategory"
            ("Name", "Description", "ParentID", "EntityID", "UserID")
        VALUES
            (p_Name, p_Description, p_ParentID, p_EntityID, p_UserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserViewCategories" WHERE "ID" = v_id;
END;
$function$;

-- spCreateVersionLabel
CREATE OR REPLACE FUNCTION __mj."spCreateVersionLabel"(
    p_ID UUID DEFAULT NULL::UUID,
    p_Name CHARACTER VARYING(200) DEFAULT NULL::CHARACTER VARYING(200),
    p_Description TEXT DEFAULT NULL::TEXT,
    p_Scope CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_EntityID UUID DEFAULT NULL::UUID,
    p_RecordID CHARACTER VARYING(750) DEFAULT NULL::CHARACTER VARYING(750),
    p_ParentID UUID DEFAULT NULL::UUID,
    p_Status CHARACTER VARYING(50) DEFAULT NULL::CHARACTER VARYING(50),
    p_CreatedByUserID UUID DEFAULT NULL::UUID,
    p_ExternalSystemID CHARACTER VARYING(200) DEFAULT NULL::CHARACTER VARYING(200),
    p_ItemCount INTEGER DEFAULT NULL::INTEGER,
    p_CreationDurationMS INTEGER DEFAULT NULL::INTEGER
)
RETURNS SETOF __mj."vwVersionLabels"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."VersionLabel"
            ("ID", "Name", "Description", "Scope", "EntityID", "RecordID", "ParentID", "Status", "CreatedByUserID", "ExternalSystemID", "ItemCount", "CreationDurationMS")
        VALUES
            (p_ID, p_Name, p_Description, COALESCE(p_Scope, 'Record'), p_EntityID, p_RecordID, p_ParentID, COALESCE(p_Status, 'Active'), p_CreatedByUserID, p_ExternalSystemID, COALESCE(p_ItemCount, 0), COALESCE(p_CreationDurationMS, 0))
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."VersionLabel"
            ("Name", "Description", "Scope", "EntityID", "RecordID", "ParentID", "Status", "CreatedByUserID", "ExternalSystemID", "ItemCount", "CreationDurationMS")
        VALUES
            (p_Name, p_Description, COALESCE(p_Scope, 'Record'), p_EntityID, p_RecordID, p_ParentID, COALESCE(p_Status, 'Active'), p_CreatedByUserID, p_ExternalSystemID, COALESCE(p_ItemCount, 0), COALESCE(p_CreationDurationMS, 0))
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwVersionLabels" WHERE "ID" = v_id;
END;
$function$;

-- spDeleteEntityBehavior
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityBehavior"(
    p_ID INTEGER
)
RETURNS TABLE("ID" INTEGER)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityBehavior"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::INTEGER AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$function$;

-- spDeleteEntityBehaviorType
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityBehaviorType"(
    p_ID INTEGER
)
RETURNS TABLE("ID" INTEGER)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityBehaviorType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::INTEGER AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$function$;

-- spUpdateAIAgent
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_LogoURL CHARACTER VARYING(255),
    p_ParentID UUID,
    p_ExposeAsAction BOOLEAN,
    p_ExecutionOrder INTEGER,
    p_ExecutionMode CHARACTER VARYING(20),
    p_EnableContextCompression BOOLEAN,
    p_ContextCompressionMessageThreshold INTEGER,
    p_ContextCompressionPromptID UUID,
    p_ContextCompressionMessageRetentionCount INTEGER,
    p_TypeID UUID,
    p_Status CHARACTER VARYING(20),
    p_DriverClass CHARACTER VARYING(255),
    p_IconClass CHARACTER VARYING(100),
    p_ModelSelectionMode CHARACTER VARYING(50),
    p_PayloadDownstreamPaths TEXT,
    p_PayloadUpstreamPaths TEXT,
    p_PayloadSelfReadPaths TEXT,
    p_PayloadSelfWritePaths TEXT,
    p_PayloadScope TEXT,
    p_FinalPayloadValidation TEXT,
    p_FinalPayloadValidationMode CHARACTER VARYING(25),
    p_FinalPayloadValidationMaxRetries INTEGER,
    p_MaxCostPerRun NUMERIC(10,4),
    p_MaxTokensPerRun INTEGER,
    p_MaxIterationsPerRun INTEGER,
    p_MaxTimePerRun INTEGER,
    p_MinExecutionsPerRun INTEGER,
    p_MaxExecutionsPerRun INTEGER,
    p_StartingPayloadValidation TEXT,
    p_StartingPayloadValidationMode CHARACTER VARYING(25),
    p_DefaultPromptEffortLevel INTEGER,
    p_ChatHandlingOption CHARACTER VARYING(30),
    p_DefaultArtifactTypeID UUID,
    p_OwnerUserID UUID,
    p_InvocationMode CHARACTER VARYING(20),
    p_ArtifactCreationMode CHARACTER VARYING(20),
    p_FunctionalRequirements TEXT,
    p_TechnicalDesign TEXT,
    p_InjectNotes BOOLEAN,
    p_MaxNotesToInject INTEGER,
    p_NoteInjectionStrategy CHARACTER VARYING(20),
    p_InjectExamples BOOLEAN,
    p_MaxExamplesToInject INTEGER,
    p_ExampleInjectionStrategy CHARACTER VARYING(20),
    p_IsRestricted BOOLEAN,
    p_MessageMode CHARACTER VARYING(50),
    p_MaxMessages INTEGER,
    p_AttachmentStorageProviderID UUID,
    p_AttachmentRootPath CHARACTER VARYING(500),
    p_InlineStorageThresholdBytes INTEGER,
    p_AgentTypePromptParams TEXT,
    p_ScopeConfig TEXT,
    p_NoteRetentionDays INTEGER,
    p_ExampleRetentionDays INTEGER,
    p_AutoArchiveEnabled BOOLEAN,
    p_RerankerConfiguration TEXT
)
RETURNS SETOF __mj."vwAIAgents"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgent"
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
        "RerankerConfiguration" = p_RerankerConfiguration
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIAgentExample
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentExample"(
    p_ID UUID,
    p_AgentID UUID,
    p_UserID UUID,
    p_CompanyID UUID,
    p_Type CHARACTER VARYING(20),
    p_ExampleInput TEXT,
    p_ExampleOutput TEXT,
    p_IsAutoGenerated BOOLEAN,
    p_SourceConversationID UUID,
    p_SourceConversationDetailID UUID,
    p_SourceAIAgentRunID UUID,
    p_SuccessScore NUMERIC(5,2),
    p_Comments TEXT,
    p_Status CHARACTER VARYING(20),
    p_EmbeddingVector TEXT,
    p_EmbeddingModelID UUID,
    p_PrimaryScopeEntityID UUID,
    p_PrimaryScopeRecordID CHARACTER VARYING(100),
    p_SecondaryScopes TEXT,
    p_LastAccessedAt TIMESTAMPTZ,
    p_AccessCount INTEGER,
    p_ExpiresAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwAIAgentExamples"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentExample"
    SET
        "AgentID" = p_AgentID,
        "UserID" = p_UserID,
        "CompanyID" = p_CompanyID,
        "Type" = p_Type,
        "ExampleInput" = p_ExampleInput,
        "ExampleOutput" = p_ExampleOutput,
        "IsAutoGenerated" = p_IsAutoGenerated,
        "SourceConversationID" = p_SourceConversationID,
        "SourceConversationDetailID" = p_SourceConversationDetailID,
        "SourceAIAgentRunID" = p_SourceAIAgentRunID,
        "SuccessScore" = p_SuccessScore,
        "Comments" = p_Comments,
        "Status" = p_Status,
        "EmbeddingVector" = p_EmbeddingVector,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "PrimaryScopeEntityID" = p_PrimaryScopeEntityID,
        "PrimaryScopeRecordID" = p_PrimaryScopeRecordID,
        "SecondaryScopes" = p_SecondaryScopes,
        "LastAccessedAt" = p_LastAccessedAt,
        "AccessCount" = p_AccessCount,
        "ExpiresAt" = p_ExpiresAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentExamples" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIAgentNote
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNote"(
    p_ID UUID,
    p_AgentID UUID,
    p_AgentNoteTypeID UUID,
    p_Note TEXT,
    p_UserID UUID,
    p_Type CHARACTER VARYING(20),
    p_IsAutoGenerated BOOLEAN,
    p_Comments TEXT,
    p_Status CHARACTER VARYING(20),
    p_SourceConversationID UUID,
    p_SourceConversationDetailID UUID,
    p_SourceAIAgentRunID UUID,
    p_CompanyID UUID,
    p_EmbeddingVector TEXT,
    p_EmbeddingModelID UUID,
    p_PrimaryScopeEntityID UUID,
    p_PrimaryScopeRecordID CHARACTER VARYING(100),
    p_SecondaryScopes TEXT,
    p_LastAccessedAt TIMESTAMPTZ,
    p_AccessCount INTEGER,
    p_ExpiresAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwAIAgentNotes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentNote"
    SET
        "AgentID" = p_AgentID,
        "AgentNoteTypeID" = p_AgentNoteTypeID,
        "Note" = p_Note,
        "UserID" = p_UserID,
        "Type" = p_Type,
        "IsAutoGenerated" = p_IsAutoGenerated,
        "Comments" = p_Comments,
        "Status" = p_Status,
        "SourceConversationID" = p_SourceConversationID,
        "SourceConversationDetailID" = p_SourceConversationDetailID,
        "SourceAIAgentRunID" = p_SourceAIAgentRunID,
        "CompanyID" = p_CompanyID,
        "EmbeddingVector" = p_EmbeddingVector,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "PrimaryScopeEntityID" = p_PrimaryScopeEntityID,
        "PrimaryScopeRecordID" = p_PrimaryScopeRecordID,
        "SecondaryScopes" = p_SecondaryScopes,
        "LastAccessedAt" = p_LastAccessedAt,
        "AccessCount" = p_AccessCount,
        "ExpiresAt" = p_ExpiresAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIAgentRun
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(
    p_ID UUID,
    p_AgentID UUID,
    p_ParentRunID UUID,
    p_Status CHARACTER VARYING(50),
    p_StartedAt TIMESTAMPTZ,
    p_CompletedAt TIMESTAMPTZ,
    p_Success BOOLEAN,
    p_ErrorMessage TEXT,
    p_ConversationID UUID,
    p_UserID UUID,
    p_Result TEXT,
    p_AgentState TEXT,
    p_TotalTokensUsed INTEGER,
    p_TotalCost NUMERIC(18,6),
    p_TotalPromptTokensUsed INTEGER,
    p_TotalCompletionTokensUsed INTEGER,
    p_TotalTokensUsedRollup INTEGER,
    p_TotalPromptTokensUsedRollup INTEGER,
    p_TotalCompletionTokensUsedRollup INTEGER,
    p_TotalCostRollup NUMERIC(19,8),
    p_ConversationDetailID UUID,
    p_ConversationDetailSequence INTEGER,
    p_CancellationReason CHARACTER VARYING(30),
    p_FinalStep CHARACTER VARYING(30),
    p_FinalPayload TEXT,
    p_Message TEXT,
    p_LastRunID UUID,
    p_StartingPayload TEXT,
    p_TotalPromptIterations INTEGER,
    p_ConfigurationID UUID,
    p_OverrideModelID UUID,
    p_OverrideVendorID UUID,
    p_Data TEXT,
    p_Verbose BOOLEAN,
    p_EffortLevel INTEGER,
    p_RunName CHARACTER VARYING(255),
    p_Comments TEXT,
    p_ScheduledJobRunID UUID,
    p_TestRunID UUID,
    p_PrimaryScopeEntityID UUID,
    p_PrimaryScopeRecordID CHARACTER VARYING(100),
    p_SecondaryScopes TEXT
)
RETURNS SETOF __mj."vwAIAgentRuns"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentRun"
    SET
        "AgentID" = p_AgentID,
        "ParentRunID" = p_ParentRunID,
        "Status" = p_Status,
        "StartedAt" = p_StartedAt,
        "CompletedAt" = p_CompletedAt,
        "Success" = p_Success,
        "ErrorMessage" = p_ErrorMessage,
        "ConversationID" = p_ConversationID,
        "UserID" = p_UserID,
        "Result" = p_Result,
        "AgentState" = p_AgentState,
        "TotalTokensUsed" = p_TotalTokensUsed,
        "TotalCost" = p_TotalCost,
        "TotalPromptTokensUsed" = p_TotalPromptTokensUsed,
        "TotalCompletionTokensUsed" = p_TotalCompletionTokensUsed,
        "TotalTokensUsedRollup" = p_TotalTokensUsedRollup,
        "TotalPromptTokensUsedRollup" = p_TotalPromptTokensUsedRollup,
        "TotalCompletionTokensUsedRollup" = p_TotalCompletionTokensUsedRollup,
        "TotalCostRollup" = p_TotalCostRollup,
        "ConversationDetailID" = p_ConversationDetailID,
        "ConversationDetailSequence" = p_ConversationDetailSequence,
        "CancellationReason" = p_CancellationReason,
        "FinalStep" = p_FinalStep,
        "FinalPayload" = p_FinalPayload,
        "Message" = p_Message,
        "LastRunID" = p_LastRunID,
        "StartingPayload" = p_StartingPayload,
        "TotalPromptIterations" = p_TotalPromptIterations,
        "ConfigurationID" = p_ConfigurationID,
        "OverrideModelID" = p_OverrideModelID,
        "OverrideVendorID" = p_OverrideVendorID,
        "Data" = p_Data,
        "Verbose" = p_Verbose,
        "EffortLevel" = p_EffortLevel,
        "RunName" = p_RunName,
        "Comments" = p_Comments,
        "ScheduledJobRunID" = p_ScheduledJobRunID,
        "TestRunID" = p_TestRunID,
        "PrimaryScopeEntityID" = p_PrimaryScopeEntityID,
        "PrimaryScopeRecordID" = p_PrimaryScopeRecordID,
        "SecondaryScopes" = p_SecondaryScopes
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIArchitecture
CREATE OR REPLACE FUNCTION __mj."spUpdateAIArchitecture"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_Category CHARACTER VARYING(50),
    p_ParentArchitectureID UUID,
    p_WikipediaURL CHARACTER VARYING(500),
    p_YearIntroduced INTEGER,
    p_KeyPaper CHARACTER VARYING(500)
)
RETURNS SETOF __mj."vwAIArchitectures"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIArchitecture"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Category" = p_Category,
        "ParentArchitectureID" = p_ParentArchitectureID,
        "WikipediaURL" = p_WikipediaURL,
        "YearIntroduced" = p_YearIntroduced,
        "KeyPaper" = p_KeyPaper
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIArchitectures" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIConfiguration
CREATE OR REPLACE FUNCTION __mj."spUpdateAIConfiguration"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_IsDefault BOOLEAN,
    p_Status CHARACTER VARYING(20),
    p_DefaultPromptForContextCompressionID UUID,
    p_DefaultPromptForContextSummarizationID UUID,
    p_DefaultStorageProviderID UUID,
    p_DefaultStorageRootPath CHARACTER VARYING(500),
    p_ParentID UUID
)
RETURNS SETOF __mj."vwAIConfigurations"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIConfiguration"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "IsDefault" = p_IsDefault,
        "Status" = p_Status,
        "DefaultPromptForContextCompressionID" = p_DefaultPromptForContextCompressionID,
        "DefaultPromptForContextSummarizationID" = p_DefaultPromptForContextSummarizationID,
        "DefaultStorageProviderID" = p_DefaultStorageProviderID,
        "DefaultStorageRootPath" = p_DefaultStorageRootPath,
        "ParentID" = p_ParentID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIConfigurations" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIPrompt
CREATE OR REPLACE FUNCTION __mj."spUpdateAIPrompt"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_TemplateID UUID,
    p_CategoryID UUID,
    p_TypeID UUID,
    p_Status CHARACTER VARYING(50),
    p_ResponseFormat CHARACTER VARYING(20),
    p_ModelSpecificResponseFormat TEXT,
    p_AIModelTypeID UUID,
    p_MinPowerRank INTEGER,
    p_SelectionStrategy CHARACTER VARYING(20),
    p_PowerPreference CHARACTER VARYING(20),
    p_ParallelizationMode CHARACTER VARYING(20),
    p_ParallelCount INTEGER,
    p_ParallelConfigParam CHARACTER VARYING(100),
    p_OutputType CHARACTER VARYING(50),
    p_OutputExample TEXT,
    p_ValidationBehavior CHARACTER VARYING(50),
    p_MaxRetries INTEGER,
    p_RetryDelayMS INTEGER,
    p_RetryStrategy CHARACTER VARYING(20),
    p_ResultSelectorPromptID UUID,
    p_EnableCaching BOOLEAN,
    p_CacheTTLSeconds INTEGER,
    p_CacheMatchType CHARACTER VARYING(20),
    p_CacheSimilarityThreshold DOUBLE PRECISION,
    p_CacheMustMatchModel BOOLEAN,
    p_CacheMustMatchVendor BOOLEAN,
    p_CacheMustMatchAgent BOOLEAN,
    p_CacheMustMatchConfig BOOLEAN,
    p_PromptRole CHARACTER VARYING(20),
    p_PromptPosition CHARACTER VARYING(20),
    p_Temperature NUMERIC(3,2),
    p_TopP NUMERIC(3,2),
    p_TopK INTEGER,
    p_MinP NUMERIC(3,2),
    p_FrequencyPenalty NUMERIC(3,2),
    p_PresencePenalty NUMERIC(3,2),
    p_Seed INTEGER,
    p_StopSequences CHARACTER VARYING(1000),
    p_IncludeLogProbs BOOLEAN,
    p_TopLogProbs INTEGER,
    p_FailoverStrategy CHARACTER VARYING(50),
    p_FailoverMaxAttempts INTEGER,
    p_FailoverDelaySeconds INTEGER,
    p_FailoverModelStrategy CHARACTER VARYING(50),
    p_FailoverErrorScope CHARACTER VARYING(50),
    p_EffortLevel INTEGER
)
RETURNS SETOF __mj."vwAIPrompts"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIPrompt"
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
        "EffortLevel" = p_EffortLevel
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIPrompts" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIPromptCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_ParentID UUID,
    p_Description TEXT
)
RETURNS SETOF __mj."vwAIPromptCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIPromptCategory"
    SET
        "Name" = p_Name,
        "ParentID" = p_ParentID,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAIPromptRun
CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(
    p_ID UUID,
    p_PromptID UUID,
    p_ModelID UUID,
    p_VendorID UUID,
    p_AgentID UUID,
    p_ConfigurationID UUID,
    p_RunAt TIMESTAMPTZ,
    p_CompletedAt TIMESTAMPTZ,
    p_ExecutionTimeMS INTEGER,
    p_Messages TEXT,
    p_Result TEXT,
    p_TokensUsed INTEGER,
    p_TokensPrompt INTEGER,
    p_TokensCompletion INTEGER,
    p_TotalCost NUMERIC(18,6),
    p_Success BOOLEAN,
    p_ErrorMessage TEXT,
    p_ParentID UUID,
    p_RunType CHARACTER VARYING(20),
    p_ExecutionOrder INTEGER,
    p_AgentRunID UUID,
    p_Cost NUMERIC(19,8),
    p_CostCurrency CHARACTER VARYING(10),
    p_TokensUsedRollup INTEGER,
    p_TokensPromptRollup INTEGER,
    p_TokensCompletionRollup INTEGER,
    p_Temperature NUMERIC(3,2),
    p_TopP NUMERIC(3,2),
    p_TopK INTEGER,
    p_MinP NUMERIC(3,2),
    p_FrequencyPenalty NUMERIC(3,2),
    p_PresencePenalty NUMERIC(3,2),
    p_Seed INTEGER,
    p_StopSequences TEXT,
    p_ResponseFormat CHARACTER VARYING(50),
    p_LogProbs BOOLEAN,
    p_TopLogProbs INTEGER,
    p_DescendantCost NUMERIC(18,6),
    p_ValidationAttemptCount INTEGER,
    p_SuccessfulValidationCount INTEGER,
    p_FinalValidationPassed BOOLEAN,
    p_ValidationBehavior CHARACTER VARYING(50),
    p_RetryStrategy CHARACTER VARYING(50),
    p_MaxRetriesConfigured INTEGER,
    p_FinalValidationError CHARACTER VARYING(500),
    p_ValidationErrorCount INTEGER,
    p_CommonValidationError CHARACTER VARYING(255),
    p_FirstAttemptAt TIMESTAMPTZ,
    p_LastAttemptAt TIMESTAMPTZ,
    p_TotalRetryDurationMS INTEGER,
    p_ValidationAttempts TEXT,
    p_ValidationSummary TEXT,
    p_FailoverAttempts INTEGER,
    p_FailoverErrors TEXT,
    p_FailoverDurations TEXT,
    p_OriginalModelID UUID,
    p_OriginalRequestStartTime TIMESTAMPTZ,
    p_TotalFailoverDuration INTEGER,
    p_RerunFromPromptRunID UUID,
    p_ModelSelection TEXT,
    p_Status CHARACTER VARYING(50),
    p_Cancelled BOOLEAN,
    p_CancellationReason TEXT,
    p_ModelPowerRank INTEGER,
    p_SelectionStrategy CHARACTER VARYING(50),
    p_CacheHit BOOLEAN,
    p_CacheKey CHARACTER VARYING(500),
    p_JudgeID UUID,
    p_JudgeScore DOUBLE PRECISION,
    p_WasSelectedResult BOOLEAN,
    p_StreamingEnabled BOOLEAN,
    p_FirstTokenTime INTEGER,
    p_ErrorDetails TEXT,
    p_ChildPromptID UUID,
    p_QueueTime INTEGER,
    p_PromptTime INTEGER,
    p_CompletionTime INTEGER,
    p_ModelSpecificResponseDetails TEXT,
    p_EffortLevel INTEGER,
    p_RunName CHARACTER VARYING(255),
    p_Comments TEXT,
    p_TestRunID UUID
)
RETURNS SETOF __mj."vwAIPromptRuns"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIPromptRun"
    SET
        "PromptID" = p_PromptID,
        "ModelID" = p_ModelID,
        "VendorID" = p_VendorID,
        "AgentID" = p_AgentID,
        "ConfigurationID" = p_ConfigurationID,
        "RunAt" = p_RunAt,
        "CompletedAt" = p_CompletedAt,
        "ExecutionTimeMS" = p_ExecutionTimeMS,
        "Messages" = p_Messages,
        "Result" = p_Result,
        "TokensUsed" = p_TokensUsed,
        "TokensPrompt" = p_TokensPrompt,
        "TokensCompletion" = p_TokensCompletion,
        "TotalCost" = p_TotalCost,
        "Success" = p_Success,
        "ErrorMessage" = p_ErrorMessage,
        "ParentID" = p_ParentID,
        "RunType" = p_RunType,
        "ExecutionOrder" = p_ExecutionOrder,
        "AgentRunID" = p_AgentRunID,
        "Cost" = p_Cost,
        "CostCurrency" = p_CostCurrency,
        "TokensUsedRollup" = p_TokensUsedRollup,
        "TokensPromptRollup" = p_TokensPromptRollup,
        "TokensCompletionRollup" = p_TokensCompletionRollup,
        "Temperature" = p_Temperature,
        "TopP" = p_TopP,
        "TopK" = p_TopK,
        "MinP" = p_MinP,
        "FrequencyPenalty" = p_FrequencyPenalty,
        "PresencePenalty" = p_PresencePenalty,
        "Seed" = p_Seed,
        "StopSequences" = p_StopSequences,
        "ResponseFormat" = p_ResponseFormat,
        "LogProbs" = p_LogProbs,
        "TopLogProbs" = p_TopLogProbs,
        "DescendantCost" = p_DescendantCost,
        "ValidationAttemptCount" = p_ValidationAttemptCount,
        "SuccessfulValidationCount" = p_SuccessfulValidationCount,
        "FinalValidationPassed" = p_FinalValidationPassed,
        "ValidationBehavior" = p_ValidationBehavior,
        "RetryStrategy" = p_RetryStrategy,
        "MaxRetriesConfigured" = p_MaxRetriesConfigured,
        "FinalValidationError" = p_FinalValidationError,
        "ValidationErrorCount" = p_ValidationErrorCount,
        "CommonValidationError" = p_CommonValidationError,
        "FirstAttemptAt" = p_FirstAttemptAt,
        "LastAttemptAt" = p_LastAttemptAt,
        "TotalRetryDurationMS" = p_TotalRetryDurationMS,
        "ValidationAttempts" = p_ValidationAttempts,
        "ValidationSummary" = p_ValidationSummary,
        "FailoverAttempts" = p_FailoverAttempts,
        "FailoverErrors" = p_FailoverErrors,
        "FailoverDurations" = p_FailoverDurations,
        "OriginalModelID" = p_OriginalModelID,
        "OriginalRequestStartTime" = p_OriginalRequestStartTime,
        "TotalFailoverDuration" = p_TotalFailoverDuration,
        "RerunFromPromptRunID" = p_RerunFromPromptRunID,
        "ModelSelection" = p_ModelSelection,
        "Status" = p_Status,
        "Cancelled" = p_Cancelled,
        "CancellationReason" = p_CancellationReason,
        "ModelPowerRank" = p_ModelPowerRank,
        "SelectionStrategy" = p_SelectionStrategy,
        "CacheHit" = p_CacheHit,
        "CacheKey" = p_CacheKey,
        "JudgeID" = p_JudgeID,
        "JudgeScore" = p_JudgeScore,
        "WasSelectedResult" = p_WasSelectedResult,
        "StreamingEnabled" = p_StreamingEnabled,
        "FirstTokenTime" = p_FirstTokenTime,
        "ErrorDetails" = p_ErrorDetails,
        "ChildPromptID" = p_ChildPromptID,
        "QueueTime" = p_QueueTime,
        "PromptTime" = p_PromptTime,
        "CompletionTime" = p_CompletionTime,
        "ModelSpecificResponseDetails" = p_ModelSpecificResponseDetails,
        "EffortLevel" = p_EffortLevel,
        "RunName" = p_RunName,
        "Comments" = p_Comments,
        "TestRunID" = p_TestRunID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAPIScope
CREATE OR REPLACE FUNCTION __mj."spUpdateAPIScope"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Category CHARACTER VARYING(100),
    p_Description CHARACTER VARYING(500),
    p_ParentID UUID,
    p_FullPath CHARACTER VARYING(500),
    p_ResourceType CHARACTER VARYING(50),
    p_IsActive BOOLEAN,
    p_UIConfig TEXT
)
RETURNS SETOF __mj."vwAPIScopes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."APIScope"
    SET
        "Name" = p_Name,
        "Category" = p_Category,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "FullPath" = p_FullPath,
        "ResourceType" = p_ResourceType,
        "IsActive" = p_IsActive,
        "UIConfig" = p_UIConfig
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAPIScopes" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAction
CREATE OR REPLACE FUNCTION __mj."spUpdateAction"(
    p_ID UUID,
    p_CategoryID UUID,
    p_Name CHARACTER VARYING(425),
    p_Description TEXT,
    p_Type CHARACTER VARYING(20),
    p_UserPrompt TEXT,
    p_UserComments TEXT,
    p_Code TEXT,
    p_CodeComments TEXT,
    p_CodeApprovalStatus CHARACTER VARYING(20),
    p_CodeApprovalComments TEXT,
    p_CodeApprovedByUserID UUID,
    p_CodeApprovedAt TIMESTAMPTZ,
    p_CodeLocked BOOLEAN,
    p_ForceCodeGeneration BOOLEAN,
    p_RetentionPeriod INTEGER,
    p_Status CHARACTER VARYING(20),
    p_DriverClass CHARACTER VARYING(255),
    p_ParentID UUID,
    p_IconClass CHARACTER VARYING(100),
    p_DefaultCompactPromptID UUID
)
RETURNS SETOF __mj."vwActions"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Action"
    SET
        "CategoryID" = p_CategoryID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Type" = p_Type,
        "UserPrompt" = p_UserPrompt,
        "UserComments" = p_UserComments,
        "Code" = p_Code,
        "CodeComments" = p_CodeComments,
        "CodeApprovalStatus" = p_CodeApprovalStatus,
        "CodeApprovalComments" = p_CodeApprovalComments,
        "CodeApprovedByUserID" = p_CodeApprovedByUserID,
        "CodeApprovedAt" = p_CodeApprovedAt,
        "CodeLocked" = p_CodeLocked,
        "ForceCodeGeneration" = p_ForceCodeGeneration,
        "RetentionPeriod" = p_RetentionPeriod,
        "Status" = p_Status,
        "DriverClass" = p_DriverClass,
        "ParentID" = p_ParentID,
        "IconClass" = p_IconClass,
        "DefaultCompactPromptID" = p_DefaultCompactPromptID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActions" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateActionCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateActionCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_ParentID UUID,
    p_Status CHARACTER VARYING(20)
)
RETURNS SETOF __mj."vwActionCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateApplicationEntity
CREATE OR REPLACE FUNCTION __mj."spUpdateApplicationEntity"(
    p_ID UUID,
    p_ApplicationID UUID,
    p_EntityID UUID,
    p_Sequence INTEGER,
    p_DefaultForNewUser BOOLEAN
)
RETURNS SETOF __mj."vwApplicationEntities"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ApplicationEntity"
    SET
        "ApplicationID" = p_ApplicationID,
        "EntityID" = p_EntityID,
        "Sequence" = p_Sequence,
        "DefaultForNewUser" = p_DefaultForNewUser
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateArtifactType
CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactType"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_ContentType CHARACTER VARYING(100),
    p_IsEnabled BOOLEAN,
    p_ParentID UUID,
    p_ExtractRules TEXT,
    p_DriverClass CHARACTER VARYING(255),
    p_Icon CHARACTER VARYING(255)
)
RETURNS SETOF __mj."vwArtifactTypes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ArtifactType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ContentType" = p_ContentType,
        "IsEnabled" = p_IsEnabled,
        "ParentID" = p_ParentID,
        "ExtractRules" = p_ExtractRules,
        "DriverClass" = p_DriverClass,
        "Icon" = p_Icon
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAuditLogType
CREATE OR REPLACE FUNCTION __mj."spUpdateAuditLogType"(
    p_ID UUID,
    p_Name CHARACTER VARYING(50),
    p_Description TEXT,
    p_ParentID UUID,
    p_AuthorizationID UUID
)
RETURNS SETOF __mj."vwAuditLogTypes"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AuditLogType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "AuthorizationID" = p_AuthorizationID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAuditLogTypes" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateAuthorization
CREATE OR REPLACE FUNCTION __mj."spUpdateAuthorization"(
    p_ID UUID,
    p_ParentID UUID,
    p_Name CHARACTER VARYING(100),
    p_IsActive BOOLEAN,
    p_UseAuditLog BOOLEAN,
    p_Description TEXT
)
RETURNS SETOF __mj."vwAuthorizations"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Authorization"
    SET
        "ParentID" = p_ParentID,
        "Name" = p_Name,
        "IsActive" = p_IsActive,
        "UseAuditLog" = p_UseAuditLog,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAuthorizations" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateCollection
CREATE OR REPLACE FUNCTION __mj."spUpdateCollection"(
    p_ID UUID,
    p_EnvironmentID UUID,
    p_ParentID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_Icon CHARACTER VARYING(50),
    p_Color CHARACTER VARYING(7),
    p_Sequence INTEGER,
    p_OwnerID UUID
)
RETURNS SETOF __mj."vwCollections"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Collection"
    SET
        "EnvironmentID" = p_EnvironmentID,
        "ParentID" = p_ParentID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Icon" = p_Icon,
        "Color" = p_Color,
        "Sequence" = p_Sequence,
        "OwnerID" = p_OwnerID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCollections" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateConversationDetail
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(
    p_ID UUID,
    p_ConversationID UUID,
    p_ExternalID CHARACTER VARYING(100),
    p_Role CHARACTER VARYING(20),
    p_Message TEXT,
    p_Error TEXT,
    p_HiddenToUser BOOLEAN,
    p_UserRating INTEGER,
    p_UserFeedback TEXT,
    p_ReflectionInsights TEXT,
    p_SummaryOfEarlierConversation TEXT,
    p_UserID UUID,
    p_ArtifactID UUID,
    p_ArtifactVersionID UUID,
    p_CompletionTime BIGINT,
    p_IsPinned BOOLEAN,
    p_ParentID UUID,
    p_AgentID UUID,
    p_Status CHARACTER VARYING(20),
    p_SuggestedResponses TEXT,
    p_TestRunID UUID,
    p_ResponseForm TEXT,
    p_ActionableCommands TEXT,
    p_AutomaticCommands TEXT,
    p_OriginalMessageChanged BOOLEAN
)
RETURNS SETOF __mj."vwConversationDetails"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ConversationDetail"
    SET
        "ConversationID" = p_ConversationID,
        "ExternalID" = p_ExternalID,
        "Role" = p_Role,
        "Message" = p_Message,
        "Error" = p_Error,
        "HiddenToUser" = p_HiddenToUser,
        "UserRating" = p_UserRating,
        "UserFeedback" = p_UserFeedback,
        "ReflectionInsights" = p_ReflectionInsights,
        "SummaryOfEarlierConversation" = p_SummaryOfEarlierConversation,
        "UserID" = p_UserID,
        "ArtifactID" = p_ArtifactID,
        "ArtifactVersionID" = p_ArtifactVersionID,
        "CompletionTime" = p_CompletionTime,
        "IsPinned" = p_IsPinned,
        "ParentID" = p_ParentID,
        "AgentID" = p_AgentID,
        "Status" = p_Status,
        "SuggestedResponses" = p_SuggestedResponses,
        "TestRunID" = p_TestRunID,
        "ResponseForm" = p_ResponseForm,
        "ActionableCommands" = p_ActionableCommands,
        "AutomaticCommands" = p_AutomaticCommands,
        "OriginalMessageChanged" = p_OriginalMessageChanged
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateConversationDetailAttachment
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailAttachment"(
    p_ID UUID,
    p_ConversationDetailID UUID,
    p_ModalityID UUID,
    p_MimeType CHARACTER VARYING(100),
    p_FileName CHARACTER VARYING(4000),
    p_FileSizeBytes INTEGER,
    p_Width INTEGER,
    p_Height INTEGER,
    p_DurationSeconds INTEGER,
    p_InlineData TEXT,
    p_FileID UUID,
    p_DisplayOrder INTEGER,
    p_ThumbnailBase64 TEXT,
    p_Description TEXT
)
RETURNS SETOF __mj."vwConversationDetailAttachments"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ConversationDetailAttachment"
    SET
        "ConversationDetailID" = p_ConversationDetailID,
        "ModalityID" = p_ModalityID,
        "MimeType" = p_MimeType,
        "FileName" = p_FileName,
        "FileSizeBytes" = p_FileSizeBytes,
        "Width" = p_Width,
        "Height" = p_Height,
        "DurationSeconds" = p_DurationSeconds,
        "InlineData" = p_InlineData,
        "FileID" = p_FileID,
        "DisplayOrder" = p_DisplayOrder,
        "ThumbnailBase64" = p_ThumbnailBase64,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateCredentialCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateCredentialCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_ParentID UUID,
    p_IconClass CHARACTER VARYING(100)
)
RETURNS SETOF __mj."vwCredentialCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CredentialCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "IconClass" = p_IconClass
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCredentialCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateDashboardCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_ParentID UUID,
    p_UserID UUID
)
RETURNS SETOF __mj."vwDashboardCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DashboardCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "UserID" = p_UserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboardCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateEntity
CREATE OR REPLACE FUNCTION __mj."spUpdateEntity"(
    p_ID UUID,
    p_ParentID UUID,
    p_Name CHARACTER VARYING(255),
    p_NameSuffix CHARACTER VARYING(255),
    p_Description TEXT,
    p_AutoUpdateDescription BOOLEAN,
    p_BaseView CHARACTER VARYING(255),
    p_BaseViewGenerated BOOLEAN,
    p_VirtualEntity BOOLEAN,
    p_TrackRecordChanges BOOLEAN,
    p_AuditRecordAccess BOOLEAN,
    p_AuditViewRuns BOOLEAN,
    p_IncludeInAPI BOOLEAN,
    p_AllowAllRowsAPI BOOLEAN,
    p_AllowUpdateAPI BOOLEAN,
    p_AllowCreateAPI BOOLEAN,
    p_AllowDeleteAPI BOOLEAN,
    p_CustomResolverAPI BOOLEAN,
    p_AllowUserSearchAPI BOOLEAN,
    p_FullTextSearchEnabled BOOLEAN,
    p_FullTextCatalog CHARACTER VARYING(255),
    p_FullTextCatalogGenerated BOOLEAN,
    p_FullTextIndex CHARACTER VARYING(255),
    p_FullTextIndexGenerated BOOLEAN,
    p_FullTextSearchFunction CHARACTER VARYING(255),
    p_FullTextSearchFunctionGenerated BOOLEAN,
    p_UserViewMaxRows INTEGER,
    p_spCreate CHARACTER VARYING(255),
    p_spUpdate CHARACTER VARYING(255),
    p_spDelete CHARACTER VARYING(255),
    p_spCreateGenerated BOOLEAN,
    p_spUpdateGenerated BOOLEAN,
    p_spDeleteGenerated BOOLEAN,
    p_CascadeDeletes BOOLEAN,
    p_DeleteType CHARACTER VARYING(10),
    p_AllowRecordMerge BOOLEAN,
    p_spMatch CHARACTER VARYING(255),
    p_RelationshipDefaultDisplayType CHARACTER VARYING(20),
    p_UserFormGenerated BOOLEAN,
    p_EntityObjectSubclassName CHARACTER VARYING(255),
    p_EntityObjectSubclassImport CHARACTER VARYING(255),
    p_PreferredCommunicationField CHARACTER VARYING(255),
    p_Icon CHARACTER VARYING(500),
    p_ScopeDefault CHARACTER VARYING(100),
    p_RowsToPackWithSchema CHARACTER VARYING(20),
    p_RowsToPackSampleMethod CHARACTER VARYING(20),
    p_RowsToPackSampleCount INTEGER,
    p_RowsToPackSampleOrder TEXT,
    p_AutoRowCountFrequency INTEGER,
    p_RowCount BIGINT,
    p_RowCountRunAt TIMESTAMPTZ,
    p_Status CHARACTER VARYING(25),
    p_DisplayName CHARACTER VARYING(255)
)
RETURNS SETOF __mj."vwEntities"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Entity"
    SET
        "ParentID" = p_ParentID,
        "Name" = p_Name,
        "NameSuffix" = p_NameSuffix,
        "Description" = p_Description,
        "AutoUpdateDescription" = p_AutoUpdateDescription,
        "BaseView" = p_BaseView,
        "BaseViewGenerated" = p_BaseViewGenerated,
        "VirtualEntity" = p_VirtualEntity,
        "TrackRecordChanges" = p_TrackRecordChanges,
        "AuditRecordAccess" = p_AuditRecordAccess,
        "AuditViewRuns" = p_AuditViewRuns,
        "IncludeInAPI" = p_IncludeInAPI,
        "AllowAllRowsAPI" = p_AllowAllRowsAPI,
        "AllowUpdateAPI" = p_AllowUpdateAPI,
        "AllowCreateAPI" = p_AllowCreateAPI,
        "AllowDeleteAPI" = p_AllowDeleteAPI,
        "CustomResolverAPI" = p_CustomResolverAPI,
        "AllowUserSearchAPI" = p_AllowUserSearchAPI,
        "FullTextSearchEnabled" = p_FullTextSearchEnabled,
        "FullTextCatalog" = p_FullTextCatalog,
        "FullTextCatalogGenerated" = p_FullTextCatalogGenerated,
        "FullTextIndex" = p_FullTextIndex,
        "FullTextIndexGenerated" = p_FullTextIndexGenerated,
        "FullTextSearchFunction" = p_FullTextSearchFunction,
        "FullTextSearchFunctionGenerated" = p_FullTextSearchFunctionGenerated,
        "UserViewMaxRows" = p_UserViewMaxRows,
        "spCreate" = p_spCreate,
        "spUpdate" = p_spUpdate,
        "spDelete" = p_spDelete,
        "spCreateGenerated" = p_spCreateGenerated,
        "spUpdateGenerated" = p_spUpdateGenerated,
        "spDeleteGenerated" = p_spDeleteGenerated,
        "CascadeDeletes" = p_CascadeDeletes,
        "DeleteType" = p_DeleteType,
        "AllowRecordMerge" = p_AllowRecordMerge,
        "spMatch" = p_spMatch,
        "RelationshipDefaultDisplayType" = p_RelationshipDefaultDisplayType,
        "UserFormGenerated" = p_UserFormGenerated,
        "EntityObjectSubclassName" = p_EntityObjectSubclassName,
        "EntityObjectSubclassImport" = p_EntityObjectSubclassImport,
        "PreferredCommunicationField" = p_PreferredCommunicationField,
        "Icon" = p_Icon,
        "ScopeDefault" = p_ScopeDefault,
        "RowsToPackWithSchema" = p_RowsToPackWithSchema,
        "RowsToPackSampleMethod" = p_RowsToPackSampleMethod,
        "RowsToPackSampleCount" = p_RowsToPackSampleCount,
        "RowsToPackSampleOrder" = p_RowsToPackSampleOrder,
        "AutoRowCountFrequency" = p_AutoRowCountFrequency,
        "RowCount" = p_RowCount,
        "RowCountRunAt" = p_RowCountRunAt,
        "Status" = p_Status,
        "DisplayName" = p_DisplayName
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateEntityField
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityField"(
    p_ID UUID,
    p_DisplayName CHARACTER VARYING(255),
    p_Description TEXT,
    p_AutoUpdateDescription BOOLEAN,
    p_IsPrimaryKey BOOLEAN,
    p_IsUnique BOOLEAN,
    p_Category CHARACTER VARYING(255),
    p_ValueListType CHARACTER VARYING(20),
    p_ExtendedType CHARACTER VARYING(50),
    p_CodeType CHARACTER VARYING(50),
    p_DefaultInView BOOLEAN,
    p_ViewCellTemplate TEXT,
    p_DefaultColumnWidth INTEGER,
    p_AllowUpdateAPI BOOLEAN,
    p_AllowUpdateInView BOOLEAN,
    p_IncludeInUserSearchAPI BOOLEAN,
    p_FullTextSearchEnabled BOOLEAN,
    p_UserSearchParamFormatAPI CHARACTER VARYING(500),
    p_IncludeInGeneratedForm BOOLEAN,
    p_GeneratedFormSection CHARACTER VARYING(10),
    p_IsNameField BOOLEAN,
    p_RelatedEntityID UUID,
    p_RelatedEntityFieldName CHARACTER VARYING(255),
    p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN,
    p_RelatedEntityNameFieldMap CHARACTER VARYING(255),
    p_RelatedEntityDisplayType CHARACTER VARYING(20),
    p_EntityIDFieldName CHARACTER VARYING(100),
    p_ScopeDefault CHARACTER VARYING(100),
    p_AutoUpdateRelatedEntityInfo BOOLEAN,
    p_ValuesToPackWithSchema CHARACTER VARYING(10),
    p_Status CHARACTER VARYING(25),
    p_AutoUpdateIsNameField BOOLEAN,
    p_AutoUpdateDefaultInView BOOLEAN,
    p_AutoUpdateCategory BOOLEAN,
    p_AutoUpdateDisplayName BOOLEAN,
    p_AutoUpdateIncludeInUserSearchAPI BOOLEAN,
    p_Encrypt BOOLEAN,
    p_EncryptionKeyID UUID,
    p_AllowDecryptInAPI BOOLEAN,
    p_SendEncryptedValue BOOLEAN,
    p_IsSoftPrimaryKey BOOLEAN,
    p_IsSoftForeignKey BOOLEAN,
    p_RelatedEntityJoinFields TEXT
)
RETURNS SETOF __mj."vwEntityFields"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityField"
    SET
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "AutoUpdateDescription" = p_AutoUpdateDescription,
        "IsPrimaryKey" = p_IsPrimaryKey,
        "IsUnique" = p_IsUnique,
        "Category" = p_Category,
        "ValueListType" = p_ValueListType,
        "ExtendedType" = p_ExtendedType,
        "CodeType" = p_CodeType,
        "DefaultInView" = p_DefaultInView,
        "ViewCellTemplate" = p_ViewCellTemplate,
        "DefaultColumnWidth" = p_DefaultColumnWidth,
        "AllowUpdateAPI" = p_AllowUpdateAPI,
        "AllowUpdateInView" = p_AllowUpdateInView,
        "IncludeInUserSearchAPI" = p_IncludeInUserSearchAPI,
        "FullTextSearchEnabled" = p_FullTextSearchEnabled,
        "UserSearchParamFormatAPI" = p_UserSearchParamFormatAPI,
        "IncludeInGeneratedForm" = p_IncludeInGeneratedForm,
        "GeneratedFormSection" = p_GeneratedFormSection,
        "IsNameField" = p_IsNameField,
        "RelatedEntityID" = p_RelatedEntityID,
        "RelatedEntityFieldName" = p_RelatedEntityFieldName,
        "IncludeRelatedEntityNameFieldInBaseView" = p_IncludeRelatedEntityNameFieldInBaseView,
        "RelatedEntityNameFieldMap" = p_RelatedEntityNameFieldMap,
        "RelatedEntityDisplayType" = p_RelatedEntityDisplayType,
        "EntityIDFieldName" = p_EntityIDFieldName,
        "ScopeDefault" = p_ScopeDefault,
        "AutoUpdateRelatedEntityInfo" = p_AutoUpdateRelatedEntityInfo,
        "ValuesToPackWithSchema" = p_ValuesToPackWithSchema,
        "Status" = p_Status,
        "AutoUpdateIsNameField" = p_AutoUpdateIsNameField,
        "AutoUpdateDefaultInView" = p_AutoUpdateDefaultInView,
        "AutoUpdateCategory" = p_AutoUpdateCategory,
        "AutoUpdateDisplayName" = p_AutoUpdateDisplayName,
        "AutoUpdateIncludeInUserSearchAPI" = p_AutoUpdateIncludeInUserSearchAPI,
        "Encrypt" = p_Encrypt,
        "EncryptionKeyID" = p_EncryptionKeyID,
        "AllowDecryptInAPI" = p_AllowDecryptInAPI,
        "SendEncryptedValue" = p_SendEncryptedValue,
        "IsSoftPrimaryKey" = p_IsSoftPrimaryKey,
        "IsSoftForeignKey" = p_IsSoftForeignKey,
        "RelatedEntityJoinFields" = p_RelatedEntityJoinFields
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateEntityFieldValue
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFieldValue"(
    p_ID UUID,
    p_EntityFieldID UUID,
    p_Sequence INTEGER,
    p_Value CHARACTER VARYING(255),
    p_Code CHARACTER VARYING(50),
    p_Description TEXT
)
RETURNS SETOF __mj."vwEntityFieldValues"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityFieldValue"
    SET
        "EntityFieldID" = p_EntityFieldID,
        "Sequence" = p_Sequence,
        "Value" = p_Value,
        "Code" = p_Code,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateEntityRelationship
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityRelationship"(
    p_ID UUID,
    p_EntityID UUID,
    p_Sequence INTEGER,
    p_RelatedEntityID UUID,
    p_BundleInAPI BOOLEAN,
    p_IncludeInParentAllQuery BOOLEAN,
    p_Type CHARACTER(20),
    p_EntityKeyField CHARACTER VARYING(255),
    p_RelatedEntityJoinField CHARACTER VARYING(255),
    p_JoinView CHARACTER VARYING(255),
    p_JoinEntityJoinField CHARACTER VARYING(255),
    p_JoinEntityInverseJoinField CHARACTER VARYING(255),
    p_DisplayInForm BOOLEAN,
    p_DisplayLocation CHARACTER VARYING(50),
    p_DisplayName CHARACTER VARYING(255),
    p_DisplayIconType CHARACTER VARYING(50),
    p_DisplayIcon CHARACTER VARYING(255),
    p_DisplayComponentID UUID,
    p_DisplayComponentConfiguration TEXT,
    p_AutoUpdateFromSchema BOOLEAN,
    p_AdditionalFieldsToInclude TEXT,
    p_AutoUpdateAdditionalFieldsToInclude BOOLEAN
)
RETURNS SETOF __mj."vwEntityRelationships"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityRelationship"
    SET
        "EntityID" = p_EntityID,
        "Sequence" = p_Sequence,
        "RelatedEntityID" = p_RelatedEntityID,
        "BundleInAPI" = p_BundleInAPI,
        "IncludeInParentAllQuery" = p_IncludeInParentAllQuery,
        "Type" = p_Type,
        "EntityKeyField" = p_EntityKeyField,
        "RelatedEntityJoinField" = p_RelatedEntityJoinField,
        "JoinView" = p_JoinView,
        "JoinEntityJoinField" = p_JoinEntityJoinField,
        "JoinEntityInverseJoinField" = p_JoinEntityInverseJoinField,
        "DisplayInForm" = p_DisplayInForm,
        "DisplayLocation" = p_DisplayLocation,
        "DisplayName" = p_DisplayName,
        "DisplayIconType" = p_DisplayIconType,
        "DisplayIcon" = p_DisplayIcon,
        "DisplayComponentID" = p_DisplayComponentID,
        "DisplayComponentConfiguration" = p_DisplayComponentConfiguration,
        "AutoUpdateFromSchema" = p_AutoUpdateFromSchema,
        "AdditionalFieldsToInclude" = p_AdditionalFieldsToInclude,
        "AutoUpdateAdditionalFieldsToInclude" = p_AutoUpdateAdditionalFieldsToInclude
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateErrorLog
CREATE OR REPLACE FUNCTION __mj."spUpdateErrorLog"(
    p_ID UUID,
    p_CompanyIntegrationRunID UUID,
    p_CompanyIntegrationRunDetailID UUID,
    p_Code CHARACTER(20),
    p_Message TEXT,
    p_CreatedBy CHARACTER VARYING(50),
    p_Status CHARACTER VARYING(10),
    p_Category CHARACTER VARYING(20),
    p_Details TEXT
)
RETURNS SETOF __mj."vwErrorLogs"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ErrorLog"
    SET
        "CompanyIntegrationRunID" = p_CompanyIntegrationRunID,
        "CompanyIntegrationRunDetailID" = p_CompanyIntegrationRunDetailID,
        "Code" = p_Code,
        "Message" = p_Message,
        "CreatedBy" = p_CreatedBy,
        "Status" = p_Status,
        "Category" = p_Category,
        "Details" = p_Details
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwErrorLogs" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateFileCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateFileCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_ParentID UUID,
    p_Description TEXT
)
RETURNS SETOF __mj."vwFileCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."FileCategory"
    SET
        "Name" = p_Name,
        "ParentID" = p_ParentID,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwFileCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateGeneratedCodeCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateGeneratedCodeCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_ParentID UUID
)
RETURNS SETOF __mj."vwGeneratedCodeCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."GeneratedCodeCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwGeneratedCodeCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateListCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateListCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_ParentID UUID,
    p_UserID UUID
)
RETURNS SETOF __mj."vwListCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ListCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "UserID" = p_UserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwListCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateProject
CREATE OR REPLACE FUNCTION __mj."spUpdateProject"(
    p_ID UUID,
    p_EnvironmentID UUID,
    p_ParentID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_Color CHARACTER VARYING(7),
    p_Icon CHARACTER VARYING(50),
    p_IsArchived BOOLEAN
)
RETURNS SETOF __mj."vwProjects"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Project"
    SET
        "EnvironmentID" = p_EnvironmentID,
        "ParentID" = p_ParentID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Color" = p_Color,
        "Icon" = p_Icon,
        "IsArchived" = p_IsArchived
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwProjects" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateQueryCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateQueryCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(50),
    p_ParentID UUID,
    p_Description TEXT,
    p_UserID UUID,
    p_DefaultCacheEnabled BOOLEAN,
    p_DefaultCacheTTLMinutes INTEGER,
    p_DefaultCacheMaxSize INTEGER,
    p_CacheInheritanceEnabled BOOLEAN
)
RETURNS SETOF __mj."vwQueryCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."QueryCategory"
    SET
        "Name" = p_Name,
        "ParentID" = p_ParentID,
        "Description" = p_Description,
        "UserID" = p_UserID,
        "DefaultCacheEnabled" = p_DefaultCacheEnabled,
        "DefaultCacheTTLMinutes" = p_DefaultCacheTTLMinutes,
        "DefaultCacheMaxSize" = p_DefaultCacheMaxSize,
        "CacheInheritanceEnabled" = p_CacheInheritanceEnabled
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueryCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateReportCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateReportCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_ParentID UUID,
    p_UserID UUID
)
RETURNS SETOF __mj."vwReportCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ReportCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "UserID" = p_UserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwReportCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateSkill
CREATE OR REPLACE FUNCTION __mj."spUpdateSkill"(
    p_ID UUID,
    p_Name CHARACTER VARYING(50),
    p_ParentID UUID
)
RETURNS SETOF __mj."vwSkills"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Skill"
    SET
        "Name" = p_Name,
        "ParentID" = p_ParentID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwSkills" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateTag
CREATE OR REPLACE FUNCTION __mj."spUpdateTag"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_ParentID UUID,
    p_DisplayName CHARACTER VARYING(255),
    p_Description TEXT
)
RETURNS SETOF __mj."vwTags"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Tag"
    SET
        "Name" = p_Name,
        "ParentID" = p_ParentID,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTags" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateTask
CREATE OR REPLACE FUNCTION __mj."spUpdateTask"(
    p_ID UUID,
    p_ParentID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_TypeID UUID,
    p_EnvironmentID UUID,
    p_ProjectID UUID,
    p_ConversationDetailID UUID,
    p_UserID UUID,
    p_AgentID UUID,
    p_Status CHARACTER VARYING(50),
    p_PercentComplete INTEGER,
    p_DueAt TIMESTAMPTZ,
    p_StartedAt TIMESTAMPTZ,
    p_CompletedAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwTasks"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Task"
    SET
        "ParentID" = p_ParentID,
        "Name" = p_Name,
        "Description" = p_Description,
        "TypeID" = p_TypeID,
        "EnvironmentID" = p_EnvironmentID,
        "ProjectID" = p_ProjectID,
        "ConversationDetailID" = p_ConversationDetailID,
        "UserID" = p_UserID,
        "AgentID" = p_AgentID,
        "Status" = p_Status,
        "PercentComplete" = p_PercentComplete,
        "DueAt" = p_DueAt,
        "StartedAt" = p_StartedAt,
        "CompletedAt" = p_CompletedAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTasks" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateTemplateCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateTemplateCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_ParentID UUID,
    p_UserID UUID
)
RETURNS SETOF __mj."vwTemplateCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TemplateCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "UserID" = p_UserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTemplateCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateTestSuite
CREATE OR REPLACE FUNCTION __mj."spUpdateTestSuite"(
    p_ID UUID,
    p_ParentID UUID,
    p_Name CHARACTER VARYING(255),
    p_Description TEXT,
    p_Status CHARACTER VARYING(20),
    p_Tags TEXT,
    p_Configuration TEXT,
    p_MaxExecutionTimeMS INTEGER,
    p_Variables TEXT
)
RETURNS SETOF __mj."vwTestSuites"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TestSuite"
    SET
        "ParentID" = p_ParentID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Status" = p_Status,
        "Tags" = p_Tags,
        "Configuration" = p_Configuration,
        "MaxExecutionTimeMS" = p_MaxExecutionTimeMS,
        "Variables" = p_Variables
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTestSuites" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateUserFavorite
CREATE OR REPLACE FUNCTION __mj."spUpdateUserFavorite"(
    p_ID UUID,
    p_UserID UUID,
    p_EntityID UUID,
    p_RecordID CHARACTER VARYING(450)
)
RETURNS SETOF __mj."vwUserFavorites"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserFavorite"
    SET
        "UserID" = p_UserID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserFavorites" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateUserViewCategory
CREATE OR REPLACE FUNCTION __mj."spUpdateUserViewCategory"(
    p_ID UUID,
    p_Name CHARACTER VARYING(100),
    p_Description TEXT,
    p_ParentID UUID,
    p_EntityID UUID,
    p_UserID UUID
)
RETURNS SETOF __mj."vwUserViewCategories"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserViewCategory"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ParentID" = p_ParentID,
        "EntityID" = p_EntityID,
        "UserID" = p_UserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserViewCategories" WHERE "ID" = p_ID;
END;
$function$;

-- spUpdateVersionLabel
CREATE OR REPLACE FUNCTION __mj."spUpdateVersionLabel"(
    p_ID UUID,
    p_Name CHARACTER VARYING(200),
    p_Description TEXT,
    p_Scope CHARACTER VARYING(50),
    p_EntityID UUID,
    p_RecordID CHARACTER VARYING(750),
    p_ParentID UUID,
    p_Status CHARACTER VARYING(50),
    p_CreatedByUserID UUID,
    p_ExternalSystemID CHARACTER VARYING(200),
    p_ItemCount INTEGER,
    p_CreationDurationMS INTEGER
)
RETURNS SETOF __mj."vwVersionLabels"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."VersionLabel"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Scope" = p_Scope,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "ParentID" = p_ParentID,
        "Status" = p_Status,
        "CreatedByUserID" = p_CreatedByUserID,
        "ExternalSystemID" = p_ExternalSystemID,
        "ItemCount" = p_ItemCount,
        "CreationDurationMS" = p_CreationDurationMS
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwVersionLabels" WHERE "ID" = p_ID;
END;
$function$;
