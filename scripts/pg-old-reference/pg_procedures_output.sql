
-- ================================================================
-- STORED PROCEDURES (converted to PostgreSQL functions)
-- ================================================================

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSourceType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentSourceType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteLibrary"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Library"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIApplicationScope"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."APIApplicationScope"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityRecordDocument"(IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_EntityDocumentID UUID, IN p_DocumentText TEXT, IN p_VectorIndexID UUID, IN p_VectorID VARCHAR(50), IN p_VectorJSON TEXT, IN p_EntityRecordUpdatedAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityRecordDocuments" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityRecordDocument"
            ("ID", "EntityID", "RecordID", "EntityDocumentID", "DocumentText", "VectorIndexID", "VectorID", "VectorJSON", "EntityRecordUpdatedAt")
        VALUES
            (p_ID, p_EntityID, p_RecordID, p_EntityDocumentID, p_DocumentText, p_VectorIndexID, p_VectorID, p_VectorJSON, p_EntityRecordUpdatedAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityRecordDocument"
            ("EntityID", "RecordID", "EntityDocumentID", "DocumentText", "VectorIndexID", "VectorID", "VectorJSON", "EntityRecordUpdatedAt")
        VALUES
            (p_EntityID, p_RecordID, p_EntityDocumentID, p_DocumentText, p_VectorIndexID, p_VectorID, p_VectorJSON, p_EntityRecordUpdatedAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityRecordDocuments" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardUserPreference"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DashboardUserPreference"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRun"(IN p_EntityID UUID, IN p_StartedByUserID UUID, IN p_SourceListID UUID, IN p_EndedAt TIMESTAMPTZ, IN p_ApprovalComments TEXT, IN p_ApprovedByUserID UUID, IN p_ProcessingErrorMessage TEXT, IN p_ID UUID DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL, IN p_ApprovalStatus VARCHAR(20) DEFAULT NULL, IN p_ProcessingStatus VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwDuplicateRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DuplicateRun"
            ("ID", "EntityID", "StartedByUserID", "SourceListID", "StartedAt", "EndedAt", "ApprovalStatus", "ApprovalComments", "ApprovedByUserID", "ProcessingStatus", "ProcessingErrorMessage")
        VALUES
            (p_ID, p_EntityID, p_StartedByUserID, p_SourceListID, p_StartedAt, p_EndedAt, p_ApprovalStatus, p_ApprovalComments, p_ApprovedByUserID, p_ProcessingStatus, p_ProcessingErrorMessage)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DuplicateRun"
            ("EntityID", "StartedByUserID", "SourceListID", "StartedAt", "EndedAt", "ApprovalStatus", "ApprovalComments", "ApprovedByUserID", "ProcessingStatus", "ProcessingErrorMessage")
        VALUES
            (p_EntityID, p_StartedByUserID, p_SourceListID, p_StartedAt, p_EndedAt, p_ApprovalStatus, p_ApprovalComments, p_ApprovedByUserID, p_ProcessingStatus, p_ProcessingErrorMessage)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServer"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."MCPServer"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTemplateContentType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CodeType VARCHAR(25))
RETURNS SETOF __mj."vwTemplateContentTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TemplateContentType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "CodeType" = p_CodeType
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTemplateContentTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityAIAction"(IN p_ID UUID, IN p_EntityID UUID, IN p_AIModelID UUID, IN p_AIActionID UUID, IN p_Name VARCHAR(255), IN p_Prompt TEXT, IN p_TriggerEvent CHAR(15), IN p_UserMessage TEXT, IN p_OutputType CHAR(10), IN p_OutputField VARCHAR(50), IN p_SkipIfOutputFieldNotEmpty BOOLEAN, IN p_OutputEntityID UUID, IN p_Comments TEXT)
RETURNS SETOF __mj."vwEntityAIActions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityAIAction"
    SET
        "EntityID" = p_EntityID,
        "AIModelID" = p_AIModelID,
        "AIActionID" = p_AIActionID,
        "Name" = p_Name,
        "Prompt" = p_Prompt,
        "TriggerEvent" = p_TriggerEvent,
        "UserMessage" = p_UserMessage,
        "OutputType" = p_OutputType,
        "OutputField" = p_OutputField,
        "SkipIfOutputFieldNotEmpty" = p_SkipIfOutputFieldNotEmpty,
        "OutputEntityID" = p_OutputEntityID,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityAIActions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPrompt"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_TemplateID UUID, IN p_CategoryID UUID, IN p_TypeID UUID, IN p_Status VARCHAR(50), IN p_ResponseFormat VARCHAR(20), IN p_ModelSpecificResponseFormat TEXT, IN p_AIModelTypeID UUID, IN p_MinPowerRank INTEGER, IN p_SelectionStrategy VARCHAR(20), IN p_PowerPreference VARCHAR(20), IN p_ParallelizationMode VARCHAR(20), IN p_ParallelCount INTEGER, IN p_ParallelConfigParam VARCHAR(100), IN p_OutputType VARCHAR(50), IN p_OutputExample TEXT, IN p_ValidationBehavior VARCHAR(50), IN p_MaxRetries INTEGER, IN p_RetryDelayMS INTEGER, IN p_RetryStrategy VARCHAR(20), IN p_ResultSelectorPromptID UUID, IN p_EnableCaching BOOLEAN, IN p_CacheTTLSeconds INTEGER, IN p_CacheMatchType VARCHAR(20), IN p_CacheSimilarityThreshold DOUBLE PRECISION, IN p_CacheMustMatchModel BOOLEAN, IN p_CacheMustMatchVendor BOOLEAN, IN p_CacheMustMatchAgent BOOLEAN, IN p_CacheMustMatchConfig BOOLEAN, IN p_PromptRole VARCHAR(20), IN p_PromptPosition VARCHAR(20), IN p_Temperature NUMERIC(3,2), IN p_TopP NUMERIC(3,2), IN p_TopK INTEGER, IN p_MinP NUMERIC(3,2), IN p_FrequencyPenalty NUMERIC(3,2), IN p_PresencePenalty NUMERIC(3,2), IN p_Seed INTEGER, IN p_StopSequences VARCHAR(1000), IN p_IncludeLogProbs BOOLEAN, IN p_TopLogProbs INTEGER, IN p_FailoverStrategy VARCHAR(50), IN p_FailoverMaxAttempts INTEGER, IN p_FailoverDelaySeconds INTEGER, IN p_FailoverModelStrategy VARCHAR(50), IN p_FailoverErrorScope VARCHAR(50), IN p_EffortLevel INTEGER)
RETURNS SETOF __mj."vwAIPrompts" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntitySetting"(IN p_EntityID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntitySettings" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntitySetting"
            ("ID", "EntityID", "Name", "Value", "Comments")
        VALUES
            (p_ID, p_EntityID, p_Name, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntitySetting"
            ("EntityID", "Name", "Value", "Comments")
        VALUES
            (p_EntityID, p_Name, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntitySettings" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCollectionArtifact"(IN p_CollectionID UUID, IN p_ArtifactVersionID UUID, IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwCollectionArtifacts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CollectionArtifact"
            ("ID", "CollectionID", "Sequence", "ArtifactVersionID")
        VALUES
            (p_ID, p_CollectionID, p_Sequence, p_ArtifactVersionID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CollectionArtifact"
            ("CollectionID", "Sequence", "ArtifactVersionID")
        VALUES
            (p_CollectionID, p_Sequence, p_ArtifactVersionID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCollectionArtifacts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardUserState"(IN p_ID UUID, IN p_DashboardID UUID, IN p_UserID UUID, IN p_UserState TEXT)
RETURNS SETOF __mj."vwDashboardUserStates" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DashboardUserState"
    SET
        "DashboardID" = p_DashboardID,
        "UserID" = p_UserID,
        "UserState" = p_UserState
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboardUserStates" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserViewCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserViewCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateOAuthAuthServerMetadataCache"(IN p_IssuerURL VARCHAR(1000), IN p_AuthorizationEndpoint VARCHAR(1000), IN p_TokenEndpoint VARCHAR(1000), IN p_RegistrationEndpoint VARCHAR(1000), IN p_RevocationEndpoint VARCHAR(1000), IN p_JwksURI VARCHAR(1000), IN p_ScopesSupported TEXT, IN p_ResponseTypesSupported TEXT, IN p_GrantTypesSupported TEXT, IN p_TokenEndpointAuthMethods TEXT, IN p_CodeChallengeMethodsSupported TEXT, IN p_MetadataJSON TEXT, IN p_ExpiresAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_CachedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwOAuthAuthServerMetadataCaches" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."OAuthAuthServerMetadataCache"
            ("ID", "IssuerURL", "AuthorizationEndpoint", "TokenEndpoint", "RegistrationEndpoint", "RevocationEndpoint", "JwksURI", "ScopesSupported", "ResponseTypesSupported", "GrantTypesSupported", "TokenEndpointAuthMethods", "CodeChallengeMethodsSupported", "MetadataJSON", "CachedAt", "ExpiresAt")
        VALUES
            (p_ID, p_IssuerURL, p_AuthorizationEndpoint, p_TokenEndpoint, p_RegistrationEndpoint, p_RevocationEndpoint, p_JwksURI, p_ScopesSupported, p_ResponseTypesSupported, p_GrantTypesSupported, p_TokenEndpointAuthMethods, p_CodeChallengeMethodsSupported, p_MetadataJSON, p_CachedAt, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."OAuthAuthServerMetadataCache"
            ("IssuerURL", "AuthorizationEndpoint", "TokenEndpoint", "RegistrationEndpoint", "RevocationEndpoint", "JwksURI", "ScopesSupported", "ResponseTypesSupported", "GrantTypesSupported", "TokenEndpointAuthMethods", "CodeChallengeMethodsSupported", "MetadataJSON", "CachedAt", "ExpiresAt")
        VALUES
            (p_IssuerURL, p_AuthorizationEndpoint, p_TokenEndpoint, p_RegistrationEndpoint, p_RevocationEndpoint, p_JwksURI, p_ScopesSupported, p_ResponseTypesSupported, p_GrantTypesSupported, p_TokenEndpointAuthMethods, p_CodeChallengeMethodsSupported, p_MetadataJSON, p_CachedAt, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwOAuthAuthServerMetadataCaches" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboard"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_UserID UUID, IN p_CategoryID UUID, IN p_UIConfigDetails TEXT, IN p_Thumbnail TEXT, IN p_ApplicationID UUID, IN p_DriverClass VARCHAR(255), IN p_Code VARCHAR(255), IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(20) DEFAULT NULL, IN p_Scope VARCHAR(20) DEFAULT NULL, IN p_EnvironmentID UUID DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Dashboard"
            ("ID", "Name", "Description", "UserID", "CategoryID", "UIConfigDetails", "Type", "Thumbnail", "Scope", "ApplicationID", "DriverClass", "Code", "EnvironmentID")
        VALUES
            (p_ID, p_Name, p_Description, p_UserID, p_CategoryID, p_UIConfigDetails, p_Type, p_Thumbnail, p_Scope, p_ApplicationID, p_DriverClass, p_Code, p_EnvironmentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Dashboard" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendation"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Recommendation"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJobType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ScheduledJobType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEmployeeRole"(IN p_ID UUID, IN p_EmployeeID UUID, IN p_RoleID UUID)
RETURNS SETOF __mj."vwEmployeeRoles" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EmployeeRole"
    SET
        "EmployeeID" = p_EmployeeID,
        "RoleID" = p_RoleID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEmployeeRoles" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentFileType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_FileExtension VARCHAR(255))
RETURNS SETOF __mj."vwContentFileTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentFileType"
    SET
        "Name" = p_Name,
        "FileExtension" = p_FileExtension
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentFileTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentPrompt"(IN p_AgentID UUID, IN p_PromptID UUID, IN p_Purpose TEXT, IN p_ConfigurationID UUID, IN p_ContextMessageCount INTEGER, IN p_ID UUID DEFAULT NULL, IN p_ExecutionOrder INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_ContextBehavior VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentPrompts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentPrompt"
            ("ID", "AgentID", "PromptID", "Purpose", "ExecutionOrder", "ConfigurationID", "Status", "ContextBehavior", "ContextMessageCount")
        VALUES
            (p_ID, p_AgentID, p_PromptID, p_Purpose, p_ExecutionOrder, p_ConfigurationID, p_Status, p_ContextBehavior, p_ContextMessageCount)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentPrompt"
            ("AgentID", "PromptID", "Purpose", "ExecutionOrder", "ConfigurationID", "Status", "ContextBehavior", "ContextMessageCount")
        VALUES
            (p_AgentID, p_PromptID, p_Purpose, p_ExecutionOrder, p_ConfigurationID, p_Status, p_ContextBehavior, p_ContextMessageCount)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentPrompts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOAuthAuthServerMetadataCache"(IN p_ID UUID, IN p_IssuerURL VARCHAR(1000), IN p_AuthorizationEndpoint VARCHAR(1000), IN p_TokenEndpoint VARCHAR(1000), IN p_RegistrationEndpoint VARCHAR(1000), IN p_RevocationEndpoint VARCHAR(1000), IN p_JwksURI VARCHAR(1000), IN p_ScopesSupported TEXT, IN p_ResponseTypesSupported TEXT, IN p_GrantTypesSupported TEXT, IN p_TokenEndpointAuthMethods TEXT, IN p_CodeChallengeMethodsSupported TEXT, IN p_MetadataJSON TEXT, IN p_CachedAt TIMESTAMPTZ, IN p_ExpiresAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwOAuthAuthServerMetadataCaches" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."OAuthAuthServerMetadataCache"
    SET
        "IssuerURL" = p_IssuerURL,
        "AuthorizationEndpoint" = p_AuthorizationEndpoint,
        "TokenEndpoint" = p_TokenEndpoint,
        "RegistrationEndpoint" = p_RegistrationEndpoint,
        "RevocationEndpoint" = p_RevocationEndpoint,
        "JwksURI" = p_JwksURI,
        "ScopesSupported" = p_ScopesSupported,
        "ResponseTypesSupported" = p_ResponseTypesSupported,
        "GrantTypesSupported" = p_GrantTypesSupported,
        "TokenEndpointAuthMethods" = p_TokenEndpointAuthMethods,
        "CodeChallengeMethodsSupported" = p_CodeChallengeMethodsSupported,
        "MetadataJSON" = p_MetadataJSON,
        "CachedAt" = p_CachedAt,
        "ExpiresAt" = p_ExpiresAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwOAuthAuthServerMetadataCaches" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordChangeReplayRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecordChangeReplayRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactPermission"(IN p_ID UUID, IN p_ArtifactID UUID, IN p_UserID UUID, IN p_CanRead BOOLEAN, IN p_CanEdit BOOLEAN, IN p_CanDelete BOOLEAN, IN p_CanShare BOOLEAN, IN p_SharedByUserID UUID)
RETURNS SETOF __mj."vwArtifactPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ArtifactPermission"
    SET
        "ArtifactID" = p_ArtifactID,
        "UserID" = p_UserID,
        "CanRead" = p_CanRead,
        "CanEdit" = p_CanEdit,
        "CanDelete" = p_CanDelete,
        "CanShare" = p_CanShare,
        "SharedByUserID" = p_SharedByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwArtifactPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationRunAPILog"(IN p_CompanyIntegrationRunID UUID, IN p_RequestMethod VARCHAR(12), IN p_URL TEXT, IN p_Parameters TEXT, IN p_ID UUID DEFAULT NULL, IN p_ExecutedAt TIMESTAMPTZ DEFAULT NULL, IN p_IsSuccess BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwCompanyIntegrationRunAPILogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CompanyIntegrationRunAPILog"
            ("ID", "CompanyIntegrationRunID", "ExecutedAt", "IsSuccess", "RequestMethod", "URL", "Parameters")
        VALUES
            (p_ID, p_CompanyIntegrationRunID, p_ExecutedAt, p_IsSuccess, p_RequestMethod, p_URL, p_Parameters)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CompanyIntegrationRunAPILog"
            ("CompanyIntegrationRunID", "ExecutedAt", "IsSuccess", "RequestMethod", "URL", "Parameters")
        VALUES
            (p_CompanyIntegrationRunID, p_ExecutedAt, p_IsSuccess, p_RequestMethod, p_URL, p_Parameters)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRunAPILogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityRecordDocument"(IN p_ID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_EntityDocumentID UUID, IN p_DocumentText TEXT, IN p_VectorIndexID UUID, IN p_VectorID VARCHAR(50), IN p_VectorJSON TEXT, IN p_EntityRecordUpdatedAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwEntityRecordDocuments" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityRecordDocument"
    SET
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "EntityDocumentID" = p_EntityDocumentID,
        "DocumentText" = p_DocumentText,
        "VectorIndexID" = p_VectorIndexID,
        "VectorID" = p_VectorID,
        "VectorJSON" = p_VectorJSON,
        "EntityRecordUpdatedAt" = p_EntityRecordUpdatedAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityRecordDocuments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntity"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Entity"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDataContextItem"(IN p_DataContextID UUID, IN p_Type VARCHAR(50), IN p_ViewID UUID, IN p_QueryID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_SQL TEXT, IN p_DataJSON TEXT, IN p_LastRefreshedAt TIMESTAMPTZ, IN p_Description TEXT, IN p_CodeName VARCHAR(255), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwDataContextItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DataContextItem"
            ("ID", "DataContextID", "Type", "ViewID", "QueryID", "EntityID", "RecordID", "SQL", "DataJSON", "LastRefreshedAt", "Description", "CodeName")
        VALUES
            (p_ID, p_DataContextID, p_Type, p_ViewID, p_QueryID, p_EntityID, p_RecordID, p_SQL, p_DataJSON, p_LastRefreshedAt, p_Description, p_CodeName)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DataContextItem"
            ("DataContextID", "Type", "ViewID", "QueryID", "EntityID", "RecordID", "SQL", "DataJSON", "LastRefreshedAt", "Description", "CodeName")
        VALUES
            (p_DataContextID, p_Type, p_ViewID, p_QueryID, p_EntityID, p_RecordID, p_SQL, p_DataJSON, p_LastRefreshedAt, p_Description, p_CodeName)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDataContextItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegration"(IN p_ID UUID, IN p_CompanyID UUID, IN p_IntegrationID UUID, IN p_IsActive BOOLEAN, IN p_AccessToken VARCHAR(255), IN p_RefreshToken VARCHAR(255), IN p_TokenExpirationDate TIMESTAMPTZ, IN p_APIKey VARCHAR(255), IN p_ExternalSystemID VARCHAR(100), IN p_IsExternalSystemReadOnly BOOLEAN, IN p_ClientID VARCHAR(255), IN p_ClientSecret VARCHAR(255), IN p_CustomAttribute1 VARCHAR(255), IN p_Name VARCHAR(255))
RETURNS SETOF __mj."vwCompanyIntegrations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CompanyIntegration"
    SET
        "CompanyID" = p_CompanyID,
        "IntegrationID" = p_IntegrationID,
        "IsActive" = p_IsActive,
        "AccessToken" = p_AccessToken,
        "RefreshToken" = p_RefreshToken,
        "TokenExpirationDate" = p_TokenExpirationDate,
        "APIKey" = p_APIKey,
        "ExternalSystemID" = p_ExternalSystemID,
        "IsExternalSystemReadOnly" = p_IsExternalSystemReadOnly,
        "ClientID" = p_ClientID,
        "ClientSecret" = p_ClientSecret,
        "CustomAttribute1" = p_CustomAttribute1,
        "Name" = p_Name
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteLibraryItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."LibraryItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateScheduledActionParam"(IN p_ScheduledActionID UUID, IN p_ActionParamID UUID, IN p_ValueType VARCHAR(20), IN p_Value TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwScheduledActionParams" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ScheduledActionParam"
            ("ID", "ScheduledActionID", "ActionParamID", "ValueType", "Value", "Comments")
        VALUES
            (p_ID, p_ScheduledActionID, p_ActionParamID, p_ValueType, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ScheduledActionParam"
            ("ScheduledActionID", "ActionParamID", "ValueType", "Value", "Comments")
        VALUES
            (p_ScheduledActionID, p_ActionParamID, p_ValueType, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwScheduledActionParams" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEncryptionAlgorithm"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_NodeCryptoName VARCHAR(50), IN p_KeyLengthBits INTEGER, IN p_IVLengthBytes INTEGER, IN p_IsAEAD BOOLEAN, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwEncryptionAlgorithms" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EncryptionAlgorithm"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "NodeCryptoName" = p_NodeCryptoName,
        "KeyLengthBits" = p_KeyLengthBits,
        "IVLengthBytes" = p_IVLengthBytes,
        "IsAEAD" = p_IsAEAD,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEncryptionAlgorithms" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthAuthServerMetadataCache"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."OAuthAuthServerMetadataCache"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentLearningCycle"(IN p_ID UUID, IN p_AgentID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_AgentSummary TEXT)
RETURNS SETOF __mj."vwAIAgentLearningCycles" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentLearningCycle"
    SET
        "AgentID" = p_AgentID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Status" = p_Status,
        "AgentSummary" = p_AgentSummary
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentLearningCycles" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestRubric"(IN p_TypeID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_PromptTemplate TEXT, IN p_Criteria TEXT, IN p_Version VARCHAR(50), IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwTestRubrics" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestRubric"
            ("ID", "TypeID", "Name", "Description", "PromptTemplate", "Criteria", "Version", "Status")
        VALUES
            (p_ID, p_TypeID, p_Name, p_Description, p_PromptTemplate, p_Criteria, p_Version, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestRubric"
            ("TypeID", "Name", "Description", "PromptTemplate", "Criteria", "Version", "Status")
        VALUES
            (p_TypeID, p_Name, p_Description, p_PromptTemplate, p_Criteria, p_Version, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestRubrics" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionContext"(IN p_ActionID UUID, IN p_ContextTypeID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwActionContexts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionContext"
            ("ID", "ActionID", "ContextTypeID", "Status")
        VALUES
            (p_ID, p_ActionID, p_ContextTypeID, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionContext"
            ("ActionID", "ContextTypeID", "Status")
        VALUES
            (p_ActionID, p_ContextTypeID, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionContexts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateVectorIndex"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_VectorDatabaseID UUID, IN p_EmbeddingModelID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwVectorIndexes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."VectorIndex"
            ("ID", "Name", "Description", "VectorDatabaseID", "EmbeddingModelID")
        VALUES
            (p_ID, p_Name, p_Description, p_VectorDatabaseID, p_EmbeddingModelID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."VectorIndex"
            ("Name", "Description", "VectorDatabaseID", "EmbeddingModelID")
        VALUES
            (p_Name, p_Description, p_VectorDatabaseID, p_EmbeddingModelID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwVectorIndexes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRun"(IN p_ID UUID, IN p_EntityID UUID, IN p_StartedByUserID UUID, IN p_SourceListID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_ApprovalStatus VARCHAR(20), IN p_ApprovalComments TEXT, IN p_ApprovedByUserID UUID, IN p_ProcessingStatus VARCHAR(20), IN p_ProcessingErrorMessage TEXT)
RETURNS SETOF __mj."vwDuplicateRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DuplicateRun"
    SET
        "EntityID" = p_EntityID,
        "StartedByUserID" = p_StartedByUserID,
        "SourceListID" = p_SourceListID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "ApprovalStatus" = p_ApprovalStatus,
        "ApprovalComments" = p_ApprovalComments,
        "ApprovedByUserID" = p_ApprovedByUserID,
        "ProcessingStatus" = p_ProcessingStatus,
        "ProcessingErrorMessage" = p_ProcessingErrorMessage
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCredentialCategory"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_IconClass VARCHAR(100), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwCredentialCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateSkill"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_ParentID UUID)
RETURNS SETOF __mj."vwSkills" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueryField"(IN p_QueryID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Sequence INTEGER, IN p_SQLBaseType VARCHAR(50), IN p_SQLFullType VARCHAR(100), IN p_SourceEntityID UUID, IN p_SourceFieldName VARCHAR(255), IN p_ComputationDescription TEXT, IN p_SummaryDescription TEXT, IN p_AutoDetectConfidenceScore NUMERIC(3,2), IN p_ID UUID DEFAULT NULL, IN p_IsComputed BOOLEAN DEFAULT NULL, IN p_IsSummary BOOLEAN DEFAULT NULL, IN p_DetectionMethod VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwQueryFields" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueryField"
            ("ID", "QueryID", "Name", "Description", "Sequence", "SQLBaseType", "SQLFullType", "SourceEntityID", "SourceFieldName", "IsComputed", "ComputationDescription", "IsSummary", "SummaryDescription", "DetectionMethod", "AutoDetectConfidenceScore")
        VALUES
            (p_ID, p_QueryID, p_Name, p_Description, p_Sequence, p_SQLBaseType, p_SQLFullType, p_SourceEntityID, p_SourceFieldName, p_IsComputed, p_ComputationDescription, p_IsSummary, p_SummaryDescription, p_DetectionMethod, p_AutoDetectConfidenceScore)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueryField"
            ("QueryID", "Name", "Description", "Sequence", "SQLBaseType", "SQLFullType", "SourceEntityID", "SourceFieldName", "IsComputed", "ComputationDescription", "IsSummary", "SummaryDescription", "DetectionMethod", "AutoDetectConfidenceScore")
        VALUES
            (p_QueryID, p_Name, p_Description, p_Sequence, p_SQLBaseType, p_SQLFullType, p_SourceEntityID, p_SourceFieldName, p_IsComputed, p_ComputationDescription, p_IsSummary, p_SummaryDescription, p_DetectionMethod, p_AutoDetectConfidenceScore)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueryFields" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCollectionArtifact"(IN p_ID UUID, IN p_CollectionID UUID, IN p_Sequence INTEGER, IN p_ArtifactVersionID UUID)
RETURNS SETOF __mj."vwCollectionArtifacts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CollectionArtifact"
    SET
        "CollectionID" = p_CollectionID,
        "Sequence" = p_Sequence,
        "ArtifactVersionID" = p_ArtifactVersionID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCollectionArtifacts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateOAuthAuthorizationState"(IN p_MCPServerConnectionID UUID, IN p_UserID UUID, IN p_StateParameter VARCHAR(128), IN p_CodeVerifier VARCHAR(128), IN p_CodeChallenge VARCHAR(128), IN p_RedirectURI VARCHAR(1000), IN p_RequestedScopes VARCHAR(500), IN p_AuthorizationURL TEXT, IN p_ErrorCode VARCHAR(100), IN p_ErrorDescription TEXT, IN p_ExpiresAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_FrontendReturnURL VARCHAR(1000), IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_InitiatedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwOAuthAuthorizationStates" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."OAuthAuthorizationState"
            ("ID", "MCPServerConnectionID", "UserID", "StateParameter", "CodeVerifier", "CodeChallenge", "RedirectURI", "RequestedScopes", "Status", "AuthorizationURL", "ErrorCode", "ErrorDescription", "InitiatedAt", "ExpiresAt", "CompletedAt", "FrontendReturnURL")
        VALUES
            (p_ID, p_MCPServerConnectionID, p_UserID, p_StateParameter, p_CodeVerifier, p_CodeChallenge, p_RedirectURI, p_RequestedScopes, p_Status, p_AuthorizationURL, p_ErrorCode, p_ErrorDescription, p_InitiatedAt, p_ExpiresAt, p_CompletedAt, p_FrontendReturnURL)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."OAuthAuthorizationState"
            ("MCPServerConnectionID", "UserID", "StateParameter", "CodeVerifier", "CodeChallenge", "RedirectURI", "RequestedScopes", "Status", "AuthorizationURL", "ErrorCode", "ErrorDescription", "InitiatedAt", "ExpiresAt", "CompletedAt", "FrontendReturnURL")
        VALUES
            (p_MCPServerConnectionID, p_UserID, p_StateParameter, p_CodeVerifier, p_CodeChallenge, p_RedirectURI, p_RequestedScopes, p_Status, p_AuthorizationURL, p_ErrorCode, p_ErrorDescription, p_InitiatedAt, p_ExpiresAt, p_CompletedAt, p_FrontendReturnURL)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwOAuthAuthorizationStates" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteSkill"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Skill"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModality"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModality"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAuthorization"(IN p_ParentID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_UseAuditLog BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAuthorizations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Authorization"
            ("ID", "ParentID", "Name", "IsActive", "UseAuditLog", "Description")
        VALUES
            (p_ID, p_ParentID, p_Name, p_IsActive, p_UseAuditLog, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Authorization"
            ("ParentID", "Name", "IsActive", "UseAuditLog", "Description")
        VALUES
            (p_ParentID, p_Name, p_IsActive, p_UseAuditLog, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAuthorizations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationArtifactVersion"(IN p_ID UUID, IN p_ConversationArtifactID UUID, IN p_Version INTEGER, IN p_Configuration TEXT, IN p_Content TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwConversationArtifactVersions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ConversationArtifactVersion"
    SET
        "ConversationArtifactID" = p_ConversationArtifactID,
        "Version" = p_Version,
        "Configuration" = p_Configuration,
        "Content" = p_Content,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversationArtifactVersions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIConfiguration"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIConfiguration"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUser"(IN p_Name VARCHAR(100), IN p_FirstName VARCHAR(50), IN p_LastName VARCHAR(50), IN p_Title VARCHAR(50), IN p_Email VARCHAR(100), IN p_Type CHAR(15), IN p_LinkedEntityID UUID, IN p_LinkedEntityRecordID VARCHAR(450), IN p_EmployeeID UUID, IN p_UserImageURL TEXT, IN p_UserImageIconClass VARCHAR(100), IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_LinkedRecordType CHAR(10) DEFAULT NULL)
RETURNS SETOF __mj."vwUsers" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."User"
            ("ID", "Name", "FirstName", "LastName", "Title", "Email", "Type", "IsActive", "LinkedRecordType", "LinkedEntityID", "LinkedEntityRecordID", "EmployeeID", "UserImageURL", "UserImageIconClass")
        VALUES
            (p_ID, p_Name, p_FirstName, p_LastName, p_Title, p_Email, p_Type, p_IsActive, p_LinkedRecordType, p_LinkedEntityID, p_LinkedEntityRecordID, p_EmployeeID, p_UserImageURL, p_UserImageIconClass)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."User"
            ("Name", "FirstName", "LastName", "Title", "Email", "Type", "IsActive", "LinkedRecordType", "LinkedEntityID", "LinkedEntityRecordID", "EmployeeID", "UserImageURL", "UserImageIconClass")
        VALUES
            (p_Name, p_FirstName, p_LastName, p_Title, p_Email, p_Type, p_IsActive, p_LinkedRecordType, p_LinkedEntityID, p_LinkedEntityRecordID, p_EmployeeID, p_UserImageURL, p_UserImageIconClass)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUsers" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateReportCategory"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwReportCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOAuthAuthorizationState"(IN p_ID UUID, IN p_MCPServerConnectionID UUID, IN p_UserID UUID, IN p_StateParameter VARCHAR(128), IN p_CodeVerifier VARCHAR(128), IN p_CodeChallenge VARCHAR(128), IN p_RedirectURI VARCHAR(1000), IN p_RequestedScopes VARCHAR(500), IN p_Status VARCHAR(50), IN p_AuthorizationURL TEXT, IN p_ErrorCode VARCHAR(100), IN p_ErrorDescription TEXT, IN p_InitiatedAt TIMESTAMPTZ, IN p_ExpiresAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_FrontendReturnURL VARCHAR(1000))
RETURNS SETOF __mj."vwOAuthAuthorizationStates" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."OAuthAuthorizationState"
    SET
        "MCPServerConnectionID" = p_MCPServerConnectionID,
        "UserID" = p_UserID,
        "StateParameter" = p_StateParameter,
        "CodeVerifier" = p_CodeVerifier,
        "CodeChallenge" = p_CodeChallenge,
        "RedirectURI" = p_RedirectURI,
        "RequestedScopes" = p_RequestedScopes,
        "Status" = p_Status,
        "AuthorizationURL" = p_AuthorizationURL,
        "ErrorCode" = p_ErrorCode,
        "ErrorDescription" = p_ErrorDescription,
        "InitiatedAt" = p_InitiatedAt,
        "ExpiresAt" = p_ExpiresAt,
        "CompletedAt" = p_CompletedAt,
        "FrontendReturnURL" = p_FrontendReturnURL
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwOAuthAuthorizationStates" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelModality"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelModality"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateGeneratedCode"(IN p_CategoryID UUID, IN p_GeneratedByModelID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Code TEXT, IN p_Source TEXT, IN p_LinkedEntityID UUID, IN p_LinkedRecordPrimaryKey TEXT, IN p_ID UUID DEFAULT NULL, IN p_GeneratedAt TIMESTAMPTZ DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_Language VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwGeneratedCodes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."GeneratedCode"
            ("ID", "GeneratedAt", "CategoryID", "GeneratedByModelID", "Name", "Description", "Code", "Source", "LinkedEntityID", "LinkedRecordPrimaryKey", "Status", "Language")
        VALUES
            (p_ID, p_GeneratedAt, p_CategoryID, p_GeneratedByModelID, p_Name, p_Description, p_Code, p_Source, p_LinkedEntityID, p_LinkedRecordPrimaryKey, p_Status, p_Language)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."GeneratedCode"
            ("GeneratedAt", "CategoryID", "GeneratedByModelID", "Name", "Description", "Code", "Source", "LinkedEntityID", "LinkedRecordPrimaryKey", "Status", "Language")
        VALUES
            (p_GeneratedAt, p_CategoryID, p_GeneratedByModelID, p_Name, p_Description, p_Code, p_Source, p_LinkedEntityID, p_LinkedRecordPrimaryKey, p_Status, p_Language)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwGeneratedCodes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOutputTriggerType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."OutputTriggerType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserNotificationType"(IN p_Name VARCHAR(100), IN p_Description VARCHAR(500), IN p_AllowUserPreference BOOLEAN, IN p_EmailTemplateID UUID, IN p_SMSTemplateID UUID, IN p_Icon VARCHAR(100), IN p_Color VARCHAR(50), IN p_AutoExpireDays INTEGER, IN p_Priority INTEGER, IN p_ID UUID DEFAULT NULL, IN p_DefaultInApp BOOLEAN DEFAULT NULL, IN p_DefaultEmail BOOLEAN DEFAULT NULL, IN p_DefaultSMS BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwUserNotificationTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserNotificationType"
            ("ID", "Name", "Description", "DefaultInApp", "DefaultEmail", "DefaultSMS", "AllowUserPreference", "EmailTemplateID", "SMSTemplateID", "Icon", "Color", "AutoExpireDays", "Priority")
        VALUES
            (p_ID, p_Name, p_Description, p_DefaultInApp, p_DefaultEmail, p_DefaultSMS, p_AllowUserPreference, p_EmailTemplateID, p_SMSTemplateID, p_Icon, p_Color, p_AutoExpireDays, p_Priority)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserNotificationType"
            ("Name", "Description", "DefaultInApp", "DefaultEmail", "DefaultSMS", "AllowUserPreference", "EmailTemplateID", "SMSTemplateID", "Icon", "Color", "AutoExpireDays", "Priority")
        VALUES
            (p_Name, p_Description, p_DefaultInApp, p_DefaultEmail, p_DefaultSMS, p_AllowUserPreference, p_EmailTemplateID, p_SMSTemplateID, p_Icon, p_Color, p_AutoExpireDays, p_Priority)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserNotificationTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserRole"(IN p_UserID UUID, IN p_RoleID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwUserRoles" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserRole"
            ("ID", "UserID", "RoleID")
        VALUES
            (p_ID, p_UserID, p_RoleID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserRole"
            ("UserID", "RoleID")
        VALUES
            (p_UserID, p_RoleID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserRoles" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateListDetail"(IN p_ListID UUID, IN p_RecordID VARCHAR(445), IN p_AdditionalData TEXT, IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL, IN p_Status VARCHAR(30) DEFAULT NULL)
RETURNS SETOF __mj."vwListDetails" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ListDetail"
            ("ID", "ListID", "RecordID", "Sequence", "Status", "AdditionalData")
        VALUES
            (p_ID, p_ListID, p_RecordID, p_Sequence, p_Status, p_AdditionalData)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ListDetail"
            ("ListID", "RecordID", "Sequence", "Status", "AdditionalData")
        VALUES
            (p_ListID, p_RecordID, p_Sequence, p_Status, p_AdditionalData)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwListDetails" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ArtifactType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCollection"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Collection"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIResultCache"(IN p_AIPromptID UUID, IN p_AIModelID UUID, IN p_RunAt TIMESTAMPTZ, IN p_PromptText TEXT, IN p_ResultText TEXT, IN p_Status VARCHAR(50), IN p_ExpiredOn TIMESTAMPTZ, IN p_VendorID UUID, IN p_AgentID UUID, IN p_ConfigurationID UUID, IN p_PromptEmbedding BYTEA, IN p_PromptRunID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIResultCaches" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIResultCache"
            ("ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID")
        VALUES
            (p_ID, p_AIPromptID, p_AIModelID, p_RunAt, p_PromptText, p_ResultText, p_Status, p_ExpiredOn, p_VendorID, p_AgentID, p_ConfigurationID, p_PromptEmbedding, p_PromptRunID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIResultCache"
            ("AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID")
        VALUES
            (p_AIPromptID, p_AIModelID, p_RunAt, p_PromptText, p_ResultText, p_Status, p_ExpiredOn, p_VendorID, p_AgentID, p_ConfigurationID, p_PromptEmbedding, p_PromptRunID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIResultCaches" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserNotificationType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description VARCHAR(500), IN p_DefaultInApp BOOLEAN, IN p_DefaultEmail BOOLEAN, IN p_DefaultSMS BOOLEAN, IN p_AllowUserPreference BOOLEAN, IN p_EmailTemplateID UUID, IN p_SMSTemplateID UUID, IN p_Icon VARCHAR(100), IN p_Color VARCHAR(50), IN p_AutoExpireDays INTEGER, IN p_Priority INTEGER)
RETURNS SETOF __mj."vwUserNotificationTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserNotificationType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DefaultInApp" = p_DefaultInApp,
        "DefaultEmail" = p_DefaultEmail,
        "DefaultSMS" = p_DefaultSMS,
        "AllowUserPreference" = p_AllowUserPreference,
        "EmailTemplateID" = p_EmailTemplateID,
        "SMSTemplateID" = p_SMSTemplateID,
        "Icon" = p_Icon,
        "Color" = p_Color,
        "AutoExpireDays" = p_AutoExpireDays,
        "Priority" = p_Priority
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserNotificationTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateComponentLibraryLink"(IN p_ComponentID UUID, IN p_LibraryID UUID, IN p_MinVersion VARCHAR(100), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwComponentLibraryLinks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ComponentLibraryLink"
            ("ID", "ComponentID", "LibraryID", "MinVersion")
        VALUES
            (p_ID, p_ComponentID, p_LibraryID, p_MinVersion)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ComponentLibraryLink"
            ("ComponentID", "LibraryID", "MinVersion")
        VALUES
            (p_ComponentID, p_LibraryID, p_MinVersion)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwComponentLibraryLinks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateOutputDeliveryType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwOutputDeliveryTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."OutputDeliveryType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."OutputDeliveryType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwOutputDeliveryTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthAuthorizationState"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."OAuthAuthorizationState"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentModality"(IN p_ID UUID, IN p_AgentID UUID, IN p_ModalityID UUID, IN p_Direction VARCHAR(10), IN p_IsAllowed BOOLEAN, IN p_MaxSizeBytes INTEGER, IN p_MaxCountPerMessage INTEGER)
RETURNS SETOF __mj."vwAIAgentModalities" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentModality"
    SET
        "AgentID" = p_AgentID,
        "ModalityID" = p_ModalityID,
        "Direction" = p_Direction,
        "IsAllowed" = p_IsAllowed,
        "MaxSizeBytes" = p_MaxSizeBytes,
        "MaxCountPerMessage" = p_MaxCountPerMessage
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentModalities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVectorIndex"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_VectorDatabaseID UUID, IN p_EmbeddingModelID UUID)
RETURNS SETOF __mj."vwVectorIndexes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."VectorIndex"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "VectorDatabaseID" = p_VectorDatabaseID,
        "EmbeddingModelID" = p_EmbeddingModelID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwVectorIndexes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardUserState"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DashboardUserState"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentPrompt"(IN p_ID UUID, IN p_AgentID UUID, IN p_PromptID UUID, IN p_Purpose TEXT, IN p_ExecutionOrder INTEGER, IN p_ConfigurationID UUID, IN p_Status VARCHAR(20), IN p_ContextBehavior VARCHAR(50), IN p_ContextMessageCount INTEGER)
RETURNS SETOF __mj."vwAIAgentPrompts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentPrompt"
    SET
        "AgentID" = p_AgentID,
        "PromptID" = p_PromptID,
        "Purpose" = p_Purpose,
        "ExecutionOrder" = p_ExecutionOrder,
        "ConfigurationID" = p_ConfigurationID,
        "Status" = p_Status,
        "ContextBehavior" = p_ContextBehavior,
        "ContextMessageCount" = p_ContextMessageCount
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentPrompts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactVersionAttribute"(IN p_ArtifactVersionID UUID, IN p_Name VARCHAR(255), IN p_Type VARCHAR(500), IN p_Value TEXT, IN p_StandardProperty VARCHAR(50), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwArtifactVersionAttributes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ArtifactVersionAttribute"
            ("ID", "ArtifactVersionID", "Name", "Type", "Value", "StandardProperty")
        VALUES
            (p_ID, p_ArtifactVersionID, p_Name, p_Type, p_Value, p_StandardProperty)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ArtifactVersionAttribute"
            ("ArtifactVersionID", "Name", "Type", "Value", "StandardProperty")
        VALUES
            (p_ArtifactVersionID, p_Name, p_Type, p_Value, p_StandardProperty)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwArtifactVersionAttributes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentTypeAttribute"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentTypeAttribute"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteListCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ListCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIPrompt"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueryField"(IN p_ID UUID, IN p_QueryID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Sequence INTEGER, IN p_SQLBaseType VARCHAR(50), IN p_SQLFullType VARCHAR(100), IN p_SourceEntityID UUID, IN p_SourceFieldName VARCHAR(255), IN p_IsComputed BOOLEAN, IN p_ComputationDescription TEXT, IN p_IsSummary BOOLEAN, IN p_SummaryDescription TEXT, IN p_DetectionMethod VARCHAR(50), IN p_AutoDetectConfidenceScore NUMERIC(3,2))
RETURNS SETOF __mj."vwQueryFields" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."QueryField"
    SET
        "QueryID" = p_QueryID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Sequence" = p_Sequence,
        "SQLBaseType" = p_SQLBaseType,
        "SQLFullType" = p_SQLFullType,
        "SourceEntityID" = p_SourceEntityID,
        "SourceFieldName" = p_SourceFieldName,
        "IsComputed" = p_IsComputed,
        "ComputationDescription" = p_ComputationDescription,
        "IsSummary" = p_IsSummary,
        "SummaryDescription" = p_SummaryDescription,
        "DetectionMethod" = p_DetectionMethod,
        "AutoDetectConfidenceScore" = p_AutoDetectConfidenceScore
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueryFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserNotificationType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserNotificationType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntitySetting"(IN p_ID UUID, IN p_EntityID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwEntitySettings" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntitySetting"
    SET
        "EntityID" = p_EntityID,
        "Name" = p_Name,
        "Value" = p_Value,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntitySettings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelVendor"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelVendor"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateOAuthClientRegistration"(IN p_MCPServerConnectionID UUID, IN p_MCPServerID UUID, IN p_IssuerURL VARCHAR(1000), IN p_ClientID VARCHAR(500), IN p_ClientSecretEncrypted TEXT, IN p_ClientIDIssuedAt TIMESTAMPTZ, IN p_ClientSecretExpiresAt TIMESTAMPTZ, IN p_RegistrationAccessToken TEXT, IN p_RegistrationClientURI VARCHAR(1000), IN p_RedirectURIs TEXT, IN p_GrantTypes TEXT, IN p_ResponseTypes TEXT, IN p_Scope VARCHAR(500), IN p_RegistrationResponse TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwOAuthClientRegistrations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."OAuthClientRegistration"
            ("ID", "MCPServerConnectionID", "MCPServerID", "IssuerURL", "ClientID", "ClientSecretEncrypted", "ClientIDIssuedAt", "ClientSecretExpiresAt", "RegistrationAccessToken", "RegistrationClientURI", "RedirectURIs", "GrantTypes", "ResponseTypes", "Scope", "Status", "RegistrationResponse")
        VALUES
            (p_ID, p_MCPServerConnectionID, p_MCPServerID, p_IssuerURL, p_ClientID, p_ClientSecretEncrypted, p_ClientIDIssuedAt, p_ClientSecretExpiresAt, p_RegistrationAccessToken, p_RegistrationClientURI, p_RedirectURIs, p_GrantTypes, p_ResponseTypes, p_Scope, p_Status, p_RegistrationResponse)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."OAuthClientRegistration"
            ("MCPServerConnectionID", "MCPServerID", "IssuerURL", "ClientID", "ClientSecretEncrypted", "ClientIDIssuedAt", "ClientSecretExpiresAt", "RegistrationAccessToken", "RegistrationClientURI", "RedirectURIs", "GrantTypes", "ResponseTypes", "Scope", "Status", "RegistrationResponse")
        VALUES
            (p_MCPServerConnectionID, p_MCPServerID, p_IssuerURL, p_ClientID, p_ClientSecretEncrypted, p_ClientIDIssuedAt, p_ClientSecretExpiresAt, p_RegistrationAccessToken, p_RegistrationClientURI, p_RedirectURIs, p_GrantTypes, p_ResponseTypes, p_Scope, p_Status, p_RegistrationResponse)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwOAuthClientRegistrations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueue"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_QueueTypeID UUID, IN p_IsActive BOOLEAN, IN p_ProcessPID INTEGER, IN p_ProcessPlatform VARCHAR(30), IN p_ProcessVersion VARCHAR(15), IN p_ProcessCwd VARCHAR(100), IN p_ProcessIPAddress VARCHAR(50), IN p_ProcessMacAddress VARCHAR(50), IN p_ProcessOSName VARCHAR(25), IN p_ProcessOSVersion VARCHAR(10), IN p_ProcessHostName VARCHAR(50), IN p_ProcessUserID VARCHAR(25), IN p_ProcessUserName VARCHAR(50), IN p_LastHeartbeat TIMESTAMPTZ)
RETURNS SETOF __mj."vwQueues" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Queue"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "QueueTypeID" = p_QueueTypeID,
        "IsActive" = p_IsActive,
        "ProcessPID" = p_ProcessPID,
        "ProcessPlatform" = p_ProcessPlatform,
        "ProcessVersion" = p_ProcessVersion,
        "ProcessCwd" = p_ProcessCwd,
        "ProcessIPAddress" = p_ProcessIPAddress,
        "ProcessMacAddress" = p_ProcessMacAddress,
        "ProcessOSName" = p_ProcessOSName,
        "ProcessOSVersion" = p_ProcessOSVersion,
        "ProcessHostName" = p_ProcessHostName,
        "ProcessUserID" = p_ProcessUserID,
        "ProcessUserName" = p_ProcessUserName,
        "LastHeartbeat" = p_LastHeartbeat
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueues" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocumentType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityDocumentType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAction"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAction"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEmployeeCompanyIntegration"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EmployeeCompanyIntegration"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOAuthClientRegistration"(IN p_ID UUID, IN p_MCPServerConnectionID UUID, IN p_MCPServerID UUID, IN p_IssuerURL VARCHAR(1000), IN p_ClientID VARCHAR(500), IN p_ClientSecretEncrypted TEXT, IN p_ClientIDIssuedAt TIMESTAMPTZ, IN p_ClientSecretExpiresAt TIMESTAMPTZ, IN p_RegistrationAccessToken TEXT, IN p_RegistrationClientURI VARCHAR(1000), IN p_RedirectURIs TEXT, IN p_GrantTypes TEXT, IN p_ResponseTypes TEXT, IN p_Scope VARCHAR(500), IN p_Status VARCHAR(50), IN p_RegistrationResponse TEXT)
RETURNS SETOF __mj."vwOAuthClientRegistrations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."OAuthClientRegistration"
    SET
        "MCPServerConnectionID" = p_MCPServerConnectionID,
        "MCPServerID" = p_MCPServerID,
        "IssuerURL" = p_IssuerURL,
        "ClientID" = p_ClientID,
        "ClientSecretEncrypted" = p_ClientSecretEncrypted,
        "ClientIDIssuedAt" = p_ClientIDIssuedAt,
        "ClientSecretExpiresAt" = p_ClientSecretExpiresAt,
        "RegistrationAccessToken" = p_RegistrationAccessToken,
        "RegistrationClientURI" = p_RegistrationClientURI,
        "RedirectURIs" = p_RedirectURIs,
        "GrantTypes" = p_GrantTypes,
        "ResponseTypes" = p_ResponseTypes,
        "Scope" = p_Scope,
        "Status" = p_Status,
        "RegistrationResponse" = p_RegistrationResponse
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwOAuthClientRegistrations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboard"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_UserID UUID, IN p_CategoryID UUID, IN p_UIConfigDetails TEXT, IN p_Type VARCHAR(20), IN p_Thumbnail TEXT, IN p_Scope VARCHAR(20), IN p_ApplicationID UUID, IN p_DriverClass VARCHAR(255), IN p_Code VARCHAR(255), IN p_EnvironmentID UUID)
RETURNS SETOF __mj."vwDashboards" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Dashboard"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "UserID" = p_UserID,
        "CategoryID" = p_CategoryID,
        "UIConfigDetails" = p_UIConfigDetails,
        "Type" = p_Type,
        "Thumbnail" = p_Thumbnail,
        "Scope" = p_Scope,
        "ApplicationID" = p_ApplicationID,
        "DriverClass" = p_DriverClass,
        "Code" = p_Code,
        "EnvironmentID" = p_EnvironmentID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboards" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityCommunicationField"(IN p_EntityCommunicationMessageTypeID UUID, IN p_FieldName VARCHAR(500), IN p_Priority INTEGER, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityCommunicationFields" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityCommunicationField"
            ("ID", "EntityCommunicationMessageTypeID", "FieldName", "Priority")
        VALUES
            (p_ID, p_EntityCommunicationMessageTypeID, p_FieldName, p_Priority)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityCommunicationField"
            ("EntityCommunicationMessageTypeID", "FieldName", "Priority")
        VALUES
            (p_EntityCommunicationMessageTypeID, p_FieldName, p_Priority)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityCommunicationFields" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserNotificationPreference"(IN p_UserID UUID, IN p_NotificationTypeID UUID, IN p_InAppEnabled BOOLEAN, IN p_EmailEnabled BOOLEAN, IN p_SMSEnabled BOOLEAN, IN p_Enabled BOOLEAN, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwUserNotificationPreferences" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserNotificationPreference"
            ("ID", "UserID", "NotificationTypeID", "InAppEnabled", "EmailEnabled", "SMSEnabled", "Enabled")
        VALUES
            (p_ID, p_UserID, p_NotificationTypeID, p_InAppEnabled, p_EmailEnabled, p_SMSEnabled, p_Enabled)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserNotificationPreference"
            ("UserID", "NotificationTypeID", "InAppEnabled", "EmailEnabled", "SMSEnabled", "Enabled")
        VALUES
            (p_UserID, p_NotificationTypeID, p_InAppEnabled, p_EmailEnabled, p_SMSEnabled, p_Enabled)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserNotificationPreferences" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateReportCategory"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID)
RETURNS SETOF __mj."vwReportCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDataContextItem"(IN p_ID UUID, IN p_DataContextID UUID, IN p_Type VARCHAR(50), IN p_ViewID UUID, IN p_QueryID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_SQL TEXT, IN p_DataJSON TEXT, IN p_LastRefreshedAt TIMESTAMPTZ, IN p_Description TEXT, IN p_CodeName VARCHAR(255))
RETURNS SETOF __mj."vwDataContextItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DataContextItem"
    SET
        "DataContextID" = p_DataContextID,
        "Type" = p_Type,
        "ViewID" = p_ViewID,
        "QueryID" = p_QueryID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "SQL" = p_SQL,
        "DataJSON" = p_DataJSON,
        "LastRefreshedAt" = p_LastRefreshedAt,
        "Description" = p_Description,
        "CodeName" = p_CodeName
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDataContextItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTemplateContent"(IN p_TemplateID UUID, IN p_TypeID UUID, IN p_TemplateText TEXT, IN p_Priority INTEGER, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwTemplateContents" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TemplateContent"
            ("ID", "TemplateID", "TypeID", "TemplateText", "Priority", "IsActive")
        VALUES
            (p_ID, p_TemplateID, p_TypeID, p_TemplateText, p_Priority, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TemplateContent"
            ("TemplateID", "TypeID", "TemplateText", "Priority", "IsActive")
        VALUES
            (p_TemplateID, p_TypeID, p_TemplateText, p_Priority, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTemplateContents" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestRubric"(IN p_ID UUID, IN p_TypeID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_PromptTemplate TEXT, IN p_Criteria TEXT, IN p_Version VARCHAR(50), IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwTestRubrics" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TestRubric"
    SET
        "TypeID" = p_TypeID,
        "Name" = p_Name,
        "Description" = p_Description,
        "PromptTemplate" = p_PromptTemplate,
        "Criteria" = p_Criteria,
        "Version" = p_Version,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTestRubrics" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentSourceParam"(IN p_ContentSourceID UUID, IN p_ContentSourceTypeParamID UUID, IN p_Value TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentSourceParams" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentSourceParam"
            ("ID", "ContentSourceID", "ContentSourceTypeParamID", "Value")
        VALUES
            (p_ID, p_ContentSourceID, p_ContentSourceTypeParamID, p_Value)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentSourceParam"
            ("ContentSourceID", "ContentSourceTypeParamID", "Value")
        VALUES
            (p_ContentSourceID, p_ContentSourceTypeParamID, p_Value)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentSourceParams" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEmployeeSkill"(IN p_EmployeeID UUID, IN p_SkillID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEmployeeSkills" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EmployeeSkill"
            ("ID", "EmployeeID", "SkillID")
        VALUES
            (p_ID, p_EmployeeID, p_SkillID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EmployeeSkill"
            ("EmployeeID", "SkillID")
        VALUES
            (p_EmployeeID, p_SkillID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEmployeeSkills" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserNotificationPreference"(IN p_ID UUID, IN p_UserID UUID, IN p_NotificationTypeID UUID, IN p_InAppEnabled BOOLEAN, IN p_EmailEnabled BOOLEAN, IN p_SMSEnabled BOOLEAN, IN p_Enabled BOOLEAN)
RETURNS SETOF __mj."vwUserNotificationPreferences" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserNotificationPreference"
    SET
        "UserID" = p_UserID,
        "NotificationTypeID" = p_NotificationTypeID,
        "InAppEnabled" = p_InAppEnabled,
        "EmailEnabled" = p_EmailEnabled,
        "SMSEnabled" = p_SMSEnabled,
        "Enabled" = p_Enabled
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserNotificationPreferences" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRequest"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentRequest"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteWorkflowRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."WorkflowRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_SystemPromptID UUID, IN p_AgentPromptPlaceholder VARCHAR(255), IN p_DriverClass VARCHAR(255), IN p_UIFormSectionKey VARCHAR(500), IN p_UIFormKey VARCHAR(500), IN p_PromptParamsSchema TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_UIFormSectionExpandedByDefault BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentType"
            ("ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema")
        VALUES
            (p_ID, p_Name, p_Description, p_SystemPromptID, p_IsActive, p_AgentPromptPlaceholder, p_DriverClass, p_UIFormSectionKey, p_UIFormKey, p_UIFormSectionExpandedByDefault, p_PromptParamsSchema)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentType"
            ("Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema")
        VALUES
            (p_Name, p_Description, p_SystemPromptID, p_IsActive, p_AgentPromptPlaceholder, p_DriverClass, p_UIFormSectionKey, p_UIFormKey, p_UIFormSectionExpandedByDefault, p_PromptParamsSchema)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthClientRegistration"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."OAuthClientRegistration"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailRating"(IN p_ConversationDetailID UUID, IN p_UserID UUID, IN p_Rating INTEGER, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwConversationDetailRatings" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationDetailRating"
            ("ID", "ConversationDetailID", "UserID", "Rating", "Comments")
        VALUES
            (p_ID, p_ConversationDetailID, p_UserID, p_Rating, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationDetailRating"
            ("ConversationDetailID", "UserID", "Rating", "Comments")
        VALUES
            (p_ConversationDetailID, p_UserID, p_Rating, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailRatings" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCredentialCategory"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_IconClass VARCHAR(100))
RETURNS SETOF __mj."vwCredentialCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledActionParam"(IN p_ID UUID, IN p_ScheduledActionID UUID, IN p_ActionParamID UUID, IN p_ValueType VARCHAR(20), IN p_Value TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwScheduledActionParams" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ScheduledActionParam"
    SET
        "ScheduledActionID" = p_ScheduledActionID,
        "ActionParamID" = p_ActionParamID,
        "ValueType" = p_ValueType,
        "Value" = p_Value,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwScheduledActionParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactVersionAttribute"(IN p_ID UUID, IN p_ArtifactVersionID UUID, IN p_Name VARCHAR(255), IN p_Type VARCHAR(500), IN p_Value TEXT, IN p_StandardProperty VARCHAR(50))
RETURNS SETOF __mj."vwArtifactVersionAttributes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ArtifactVersionAttribute"
    SET
        "ArtifactVersionID" = p_ArtifactVersionID,
        "Name" = p_Name,
        "Type" = p_Type,
        "Value" = p_Value,
        "StandardProperty" = p_StandardProperty
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwArtifactVersionAttributes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAuthorization"(IN p_ID UUID, IN p_ParentID UUID, IN p_Name VARCHAR(100), IN p_IsActive BOOLEAN, IN p_UseAuditLog BOOLEAN, IN p_Description TEXT)
RETURNS SETOF __mj."vwAuthorizations" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationRunAPILog"(IN p_ID UUID, IN p_CompanyIntegrationRunID UUID, IN p_ExecutedAt TIMESTAMPTZ, IN p_IsSuccess BOOLEAN, IN p_RequestMethod VARCHAR(12), IN p_URL TEXT, IN p_Parameters TEXT)
RETURNS SETOF __mj."vwCompanyIntegrationRunAPILogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CompanyIntegrationRunAPILog"
    SET
        "CompanyIntegrationRunID" = p_CompanyIntegrationRunID,
        "ExecutedAt" = p_ExecutedAt,
        "IsSuccess" = p_IsSuccess,
        "RequestMethod" = p_RequestMethod,
        "URL" = p_URL,
        "Parameters" = p_Parameters
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRunAPILogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityRecordDocument"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityRecordDocument"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserNotificationPreference"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserNotificationPreference"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUser"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_FirstName VARCHAR(50), IN p_LastName VARCHAR(50), IN p_Title VARCHAR(50), IN p_Email VARCHAR(100), IN p_Type CHAR(15), IN p_IsActive BOOLEAN, IN p_LinkedRecordType CHAR(10), IN p_LinkedEntityID UUID, IN p_LinkedEntityRecordID VARCHAR(450), IN p_EmployeeID UUID, IN p_UserImageURL TEXT, IN p_UserImageIconClass VARCHAR(100))
RETURNS SETOF __mj."vwUsers" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."User"
    SET
        "Name" = p_Name,
        "FirstName" = p_FirstName,
        "LastName" = p_LastName,
        "Title" = p_Title,
        "Email" = p_Email,
        "Type" = p_Type,
        "IsActive" = p_IsActive,
        "LinkedRecordType" = p_LinkedRecordType,
        "LinkedEntityID" = p_LinkedEntityID,
        "LinkedEntityRecordID" = p_LinkedEntityRecordID,
        "EmployeeID" = p_EmployeeID,
        "UserImageURL" = p_UserImageURL,
        "UserImageIconClass" = p_UserImageIconClass
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUsers" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelAction"(IN p_AIModelID UUID, IN p_AIActionID UUID, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelActions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelAction"
            ("ID", "AIModelID", "AIActionID", "IsActive")
        VALUES
            (p_ID, p_AIModelID, p_AIActionID, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelAction"
            ("AIModelID", "AIActionID", "IsActive")
        VALUES
            (p_AIModelID, p_AIActionID, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelActions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptModel"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIPromptModel"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateOAuthToken"(IN p_MCPServerConnectionID UUID, IN p_CredentialID UUID, IN p_ExpiresAt TIMESTAMPTZ, IN p_Scope VARCHAR(500), IN p_IssuerURL VARCHAR(1000), IN p_LastRefreshAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_TokenType VARCHAR(50) DEFAULT NULL, IN p_RefreshCount INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwOAuthTokens" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."OAuthToken"
            ("ID", "MCPServerConnectionID", "CredentialID", "TokenType", "ExpiresAt", "Scope", "IssuerURL", "LastRefreshAt", "RefreshCount")
        VALUES
            (p_ID, p_MCPServerConnectionID, p_CredentialID, p_TokenType, p_ExpiresAt, p_Scope, p_IssuerURL, p_LastRefreshAt, p_RefreshCount)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."OAuthToken"
            ("MCPServerConnectionID", "CredentialID", "TokenType", "ExpiresAt", "Scope", "IssuerURL", "LastRefreshAt", "RefreshCount")
        VALUES
            (p_MCPServerConnectionID, p_CredentialID, p_TokenType, p_ExpiresAt, p_Scope, p_IssuerURL, p_LastRefreshAt, p_RefreshCount)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwOAuthTokens" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEnvironment"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Settings TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsDefault BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEnvironments" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Environment"
            ("ID", "Name", "Description", "IsDefault", "Settings")
        VALUES
            (p_ID, p_Name, p_Description, p_IsDefault, p_Settings)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Environment"
            ("Name", "Description", "IsDefault", "Settings")
        VALUES
            (p_Name, p_Description, p_IsDefault, p_Settings)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEnvironments" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ArtifactPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionContext"(IN p_ID UUID, IN p_ActionID UUID, IN p_ContextTypeID UUID, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwActionContexts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionContext"
    SET
        "ActionID" = p_ActionID,
        "ContextTypeID" = p_ContextTypeID,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionContexts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIResultCache"(IN p_ID UUID, IN p_AIPromptID UUID, IN p_AIModelID UUID, IN p_RunAt TIMESTAMPTZ, IN p_PromptText TEXT, IN p_ResultText TEXT, IN p_Status VARCHAR(50), IN p_ExpiredOn TIMESTAMPTZ, IN p_VendorID UUID, IN p_AgentID UUID, IN p_ConfigurationID UUID, IN p_PromptEmbedding BYTEA, IN p_PromptRunID UUID)
RETURNS SETOF __mj."vwAIResultCaches" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIResultCache"
    SET
        "AIPromptID" = p_AIPromptID,
        "AIModelID" = p_AIModelID,
        "RunAt" = p_RunAt,
        "PromptText" = p_PromptText,
        "ResultText" = p_ResultText,
        "Status" = p_Status,
        "ExpiredOn" = p_ExpiredOn,
        "VendorID" = p_VendorID,
        "AgentID" = p_AgentID,
        "ConfigurationID" = p_ConfigurationID,
        "PromptEmbedding" = p_PromptEmbedding,
        "PromptRunID" = p_PromptRunID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIResultCaches" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateComponentLibraryLink"(IN p_ID UUID, IN p_ComponentID UUID, IN p_LibraryID UUID, IN p_MinVersion VARCHAR(100))
RETURNS SETOF __mj."vwComponentLibraryLinks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ComponentLibraryLink"
    SET
        "ComponentID" = p_ComponentID,
        "LibraryID" = p_LibraryID,
        "MinVersion" = p_MinVersion
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwComponentLibraryLinks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserRole"(IN p_ID UUID, IN p_UserID UUID, IN p_RoleID UUID)
RETURNS SETOF __mj."vwUserRoles" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserRole"
    SET
        "UserID" = p_UserID,
        "RoleID" = p_RoleID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserRoles" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOAuthToken"(IN p_ID UUID, IN p_MCPServerConnectionID UUID, IN p_CredentialID UUID, IN p_TokenType VARCHAR(50), IN p_ExpiresAt TIMESTAMPTZ, IN p_Scope VARCHAR(500), IN p_IssuerURL VARCHAR(1000), IN p_LastRefreshAt TIMESTAMPTZ, IN p_RefreshCount INTEGER)
RETURNS SETOF __mj."vwOAuthTokens" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."OAuthToken"
    SET
        "MCPServerConnectionID" = p_MCPServerConnectionID,
        "CredentialID" = p_CredentialID,
        "TokenType" = p_TokenType,
        "ExpiresAt" = p_ExpiresAt,
        "Scope" = p_Scope,
        "IssuerURL" = p_IssuerURL,
        "LastRefreshAt" = p_LastRefreshAt,
        "RefreshCount" = p_RefreshCount
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwOAuthTokens" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateReportUserState"(IN p_ReportID UUID, IN p_UserID UUID, IN p_ReportState TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwReportUserStates" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ReportUserState"
            ("ID", "ReportID", "UserID", "ReportState")
        VALUES
            (p_ID, p_ReportID, p_UserID, p_ReportState)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ReportUserState"
            ("ReportID", "UserID", "ReportState")
        VALUES
            (p_ReportID, p_UserID, p_ReportState)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwReportUserStates" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordChange"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecordChange"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteListShare"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ListShare"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserNotification"(IN p_UserID UUID, IN p_Title VARCHAR(255), IN p_Message TEXT, IN p_ResourceTypeID UUID, IN p_ResourceConfiguration TEXT, IN p_ReadAt TIMESTAMPTZ, IN p_ResourceRecordID UUID, IN p_NotificationTypeID UUID, IN p_ID UUID DEFAULT NULL, IN p_Unread BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwUserNotifications" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserNotification"
            ("ID", "UserID", "Title", "Message", "ResourceTypeID", "ResourceConfiguration", "Unread", "ReadAt", "ResourceRecordID", "NotificationTypeID")
        VALUES
            (p_ID, p_UserID, p_Title, p_Message, p_ResourceTypeID, p_ResourceConfiguration, p_Unread, p_ReadAt, p_ResourceRecordID, p_NotificationTypeID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserNotification"
            ("UserID", "Title", "Message", "ResourceTypeID", "ResourceConfiguration", "Unread", "ReadAt", "ResourceRecordID", "NotificationTypeID")
        VALUES
            (p_UserID, p_Title, p_Message, p_ResourceTypeID, p_ResourceConfiguration, p_Unread, p_ReadAt, p_ResourceRecordID, p_NotificationTypeID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserNotifications" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEnvironment"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Environment"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOutputDeliveryType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwOutputDeliveryTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."OutputDeliveryType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwOutputDeliveryTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEncryptionAlgorithm"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EncryptionAlgorithm"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTaggedItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TaggedItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateGeneratedCode"(IN p_ID UUID, IN p_GeneratedAt TIMESTAMPTZ, IN p_CategoryID UUID, IN p_GeneratedByModelID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Code TEXT, IN p_Source TEXT, IN p_LinkedEntityID UUID, IN p_LinkedRecordPrimaryKey TEXT, IN p_Status VARCHAR(20), IN p_Language VARCHAR(50))
RETURNS SETOF __mj."vwGeneratedCodes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."GeneratedCode"
    SET
        "GeneratedAt" = p_GeneratedAt,
        "CategoryID" = p_CategoryID,
        "GeneratedByModelID" = p_GeneratedByModelID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Code" = p_Code,
        "Source" = p_Source,
        "LinkedEntityID" = p_LinkedEntityID,
        "LinkedRecordPrimaryKey" = p_LinkedRecordPrimaryKey,
        "Status" = p_Status,
        "Language" = p_Language
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwGeneratedCodes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteListDetail"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ListDetail"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIConfigurationParam"(IN p_ConfigurationID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIConfigurationParams" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIConfigurationParam"
            ("ID", "ConfigurationID", "Name", "Type", "Value", "Description")
        VALUES
            (p_ID, p_ConfigurationID, p_Name, p_Type, p_Value, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIConfigurationParam"
            ("ConfigurationID", "Name", "Type", "Value", "Description")
        VALUES
            (p_ConfigurationID, p_Name, p_Type, p_Value, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIConfigurationParams" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserNotification"(IN p_ID UUID, IN p_UserID UUID, IN p_Title VARCHAR(255), IN p_Message TEXT, IN p_ResourceTypeID UUID, IN p_ResourceConfiguration TEXT, IN p_Unread BOOLEAN, IN p_ReadAt TIMESTAMPTZ, IN p_ResourceRecordID UUID, IN p_NotificationTypeID UUID)
RETURNS SETOF __mj."vwUserNotifications" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserNotification"
    SET
        "UserID" = p_UserID,
        "Title" = p_Title,
        "Message" = p_Message,
        "ResourceTypeID" = p_ResourceTypeID,
        "ResourceConfiguration" = p_ResourceConfiguration,
        "Unread" = p_Unread,
        "ReadAt" = p_ReadAt,
        "ResourceRecordID" = p_ResourceRecordID,
        "NotificationTypeID" = p_NotificationTypeID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserNotifications" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOAuthToken"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."OAuthToken"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompany"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Company"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityCommunicationField"(IN p_ID UUID, IN p_EntityCommunicationMessageTypeID UUID, IN p_FieldName VARCHAR(500), IN p_Priority INTEGER)
RETURNS SETOF __mj."vwEntityCommunicationFields" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityCommunicationField"
    SET
        "EntityCommunicationMessageTypeID" = p_EntityCommunicationMessageTypeID,
        "FieldName" = p_FieldName,
        "Priority" = p_Priority
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityCommunicationFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIResultCache"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIResultCache"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocument"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityDocument"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserSetting"(IN p_UserID UUID, IN p_Setting VARCHAR(255), IN p_Value TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwUserSettings" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserSetting"
            ("ID", "UserID", "Setting", "Value")
        VALUES
            (p_ID, p_UserID, p_Setting, p_Value)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserSetting"
            ("UserID", "Setting", "Value")
        VALUES
            (p_UserID, p_Setting, p_Value)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserSettings" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompany"(IN p_Name VARCHAR(50), IN p_Description VARCHAR(200), IN p_Website VARCHAR(100), IN p_LogoURL VARCHAR(500), IN p_Domain VARCHAR(255), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwCompanies" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Company"
            ("ID", "Name", "Description", "Website", "LogoURL", "Domain")
        VALUES
            (p_ID, p_Name, p_Description, p_Website, p_LogoURL, p_Domain)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Company"
            ("Name", "Description", "Website", "LogoURL", "Domain")
        VALUES
            (p_Name, p_Description, p_Website, p_LogoURL, p_Domain)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCompanies" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateListDetail"(IN p_ID UUID, IN p_ListID UUID, IN p_RecordID VARCHAR(445), IN p_Sequence INTEGER, IN p_Status VARCHAR(30), IN p_AdditionalData TEXT)
RETURNS SETOF __mj."vwListDetails" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ListDetail"
    SET
        "ListID" = p_ListID,
        "RecordID" = p_RecordID,
        "Sequence" = p_Sequence,
        "Status" = p_Status,
        "AdditionalData" = p_AdditionalData
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwListDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordMergeLog"(IN p_EntityID UUID, IN p_SurvivingRecordID VARCHAR(450), IN p_InitiatedByUserID UUID, IN p_ApprovedByUserID UUID, IN p_ProcessingEndedAt TIMESTAMPTZ, IN p_ProcessingLog TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_ApprovalStatus VARCHAR(10) DEFAULT NULL, IN p_ProcessingStatus VARCHAR(10) DEFAULT NULL, IN p_ProcessingStartedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwRecordMergeLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecordMergeLog"
            ("ID", "EntityID", "SurvivingRecordID", "InitiatedByUserID", "ApprovalStatus", "ApprovedByUserID", "ProcessingStatus", "ProcessingStartedAt", "ProcessingEndedAt", "ProcessingLog", "Comments")
        VALUES
            (p_ID, p_EntityID, p_SurvivingRecordID, p_InitiatedByUserID, p_ApprovalStatus, p_ApprovedByUserID, p_ProcessingStatus, p_ProcessingStartedAt, p_ProcessingEndedAt, p_ProcessingLog, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecordMergeLog"
            ("EntityID", "SurvivingRecordID", "InitiatedByUserID", "ApprovalStatus", "ApprovedByUserID", "ProcessingStatus", "ProcessingStartedAt", "ProcessingEndedAt", "ProcessingLog", "Comments")
        VALUES
            (p_EntityID, p_SurvivingRecordID, p_InitiatedByUserID, p_ApprovalStatus, p_ApprovedByUserID, p_ProcessingStatus, p_ProcessingStartedAt, p_ProcessingEndedAt, p_ProcessingLog, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecordMergeLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecommendation"(IN p_RecommendationRunID UUID, IN p_SourceEntityID UUID, IN p_SourceEntityRecordID TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRecommendations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Recommendation"
            ("ID", "RecommendationRunID", "SourceEntityID", "SourceEntityRecordID")
        VALUES
            (p_ID, p_RecommendationRunID, p_SourceEntityID, p_SourceEntityRecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Recommendation"
            ("RecommendationRunID", "SourceEntityID", "SourceEntityRecordID")
        VALUES
            (p_RecommendationRunID, p_SourceEntityID, p_SourceEntityRecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecommendations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEmployeeSkill"(IN p_ID UUID, IN p_EmployeeID UUID, IN p_SkillID UUID)
RETURNS SETOF __mj."vwEmployeeSkills" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EmployeeSkill"
    SET
        "EmployeeID" = p_EmployeeID,
        "SkillID" = p_SkillID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEmployeeSkills" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserNotification"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserNotification"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemAttribute"(IN p_ContentItemID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentItemAttributes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentItemAttribute"
            ("ID", "ContentItemID", "Name", "Value")
        VALUES
            (p_ID, p_ContentItemID, p_Name, p_Value)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentItemAttribute"
            ("ContentItemID", "Name", "Value")
        VALUES
            (p_ContentItemID, p_Name, p_Value)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentItemAttributes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEmployeeRole"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EmployeeRole"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_SystemPromptID UUID, IN p_IsActive BOOLEAN, IN p_AgentPromptPlaceholder VARCHAR(255), IN p_DriverClass VARCHAR(255), IN p_UIFormSectionKey VARCHAR(500), IN p_UIFormKey VARCHAR(500), IN p_UIFormSectionExpandedByDefault BOOLEAN, IN p_PromptParamsSchema TEXT)
RETURNS SETOF __mj."vwAIAgentTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "SystemPromptID" = p_SystemPromptID,
        "IsActive" = p_IsActive,
        "AgentPromptPlaceholder" = p_AgentPromptPlaceholder,
        "DriverClass" = p_DriverClass,
        "UIFormSectionKey" = p_UIFormSectionKey,
        "UIFormKey" = p_UIFormKey,
        "UIFormSectionExpandedByDefault" = p_UIFormSectionExpandedByDefault,
        "PromptParamsSchema" = p_PromptParamsSchema
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateWorkspace"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_UserID UUID, IN p_Configuration TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwWorkspaces" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Workspace"
            ("ID", "Name", "Description", "UserID", "Configuration")
        VALUES
            (p_ID, p_Name, p_Description, p_UserID, p_Configuration)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Workspace"
            ("Name", "Description", "UserID", "Configuration")
        VALUES
            (p_Name, p_Description, p_UserID, p_Configuration)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwWorkspaces" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegration"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CompanyIntegration"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteList"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."List"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSourceParam"(IN p_ID UUID, IN p_ContentSourceID UUID, IN p_ContentSourceTypeParamID UUID, IN p_Value TEXT)
RETURNS SETOF __mj."vwContentSourceParams" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentSourceParam"
    SET
        "ContentSourceID" = p_ContentSourceID,
        "ContentSourceTypeParamID" = p_ContentSourceTypeParamID,
        "Value" = p_Value
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentSourceParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentConfiguration"(IN p_AgentID UUID, IN p_Name VARCHAR(100), IN p_DisplayName VARCHAR(200), IN p_Description TEXT, IN p_AIConfigurationID UUID, IN p_ID UUID DEFAULT NULL, IN p_IsDefault BOOLEAN DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentConfigurations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentConfiguration"
            ("ID", "AgentID", "Name", "DisplayName", "Description", "AIConfigurationID", "IsDefault", "Priority", "Status")
        VALUES
            (p_ID, p_AgentID, p_Name, p_DisplayName, p_Description, p_AIConfigurationID, p_IsDefault, p_Priority, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentConfiguration"
            ("AgentID", "Name", "DisplayName", "Description", "AIConfigurationID", "IsDefault", "Priority", "Status")
        VALUES
            (p_AgentID, p_Name, p_DisplayName, p_Description, p_AIConfigurationID, p_IsDefault, p_Priority, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentConfigurations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestRubric"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TestRubric"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateScheduledJobRun"(IN p_ScheduledJobID UUID, IN p_CompletedAt TIMESTAMPTZ, IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_Details TEXT, IN p_ExecutedByUserID UUID, IN p_QueuedAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwScheduledJobRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ScheduledJobRun"
            ("ID", "ScheduledJobID", "StartedAt", "CompletedAt", "Status", "Success", "ErrorMessage", "Details", "ExecutedByUserID", "QueuedAt")
        VALUES
            (p_ID, p_ScheduledJobID, p_StartedAt, p_CompletedAt, p_Status, p_Success, p_ErrorMessage, p_Details, p_ExecutedByUserID, p_QueuedAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ScheduledJobRun"
            ("ScheduledJobID", "StartedAt", "CompletedAt", "Status", "Success", "ErrorMessage", "Details", "ExecutedByUserID", "QueuedAt")
        VALUES
            (p_ScheduledJobID, p_StartedAt, p_CompletedAt, p_Status, p_Success, p_ErrorMessage, p_Details, p_ExecutedByUserID, p_QueuedAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwScheduledJobRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(IN p_ID UUID, IN p_ConversationID UUID, IN p_ExternalID VARCHAR(100), IN p_Role VARCHAR(20), IN p_Message TEXT, IN p_Error TEXT, IN p_HiddenToUser BOOLEAN, IN p_UserRating INTEGER, IN p_UserFeedback TEXT, IN p_ReflectionInsights TEXT, IN p_SummaryOfEarlierConversation TEXT, IN p_UserID UUID, IN p_ArtifactID UUID, IN p_ArtifactVersionID UUID, IN p_CompletionTime BIGINT, IN p_IsPinned BOOLEAN, IN p_ParentID UUID, IN p_AgentID UUID, IN p_Status VARCHAR(20), IN p_SuggestedResponses TEXT, IN p_TestRunID UUID, IN p_ResponseForm TEXT, IN p_ActionableCommands TEXT, IN p_AutomaticCommands TEXT, IN p_OriginalMessageChanged BOOLEAN)
RETURNS SETOF __mj."vwConversationDetails" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifactVersion"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ConversationArtifactVersion"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityPermission"(IN p_EntityID UUID, IN p_RoleID UUID, IN p_ReadRLSFilterID UUID, IN p_CreateRLSFilterID UUID, IN p_UpdateRLSFilterID UUID, IN p_DeleteRLSFilterID UUID, IN p_ID UUID DEFAULT NULL, IN p_CanCreate BOOLEAN DEFAULT NULL, IN p_CanRead BOOLEAN DEFAULT NULL, IN p_CanUpdate BOOLEAN DEFAULT NULL, IN p_CanDelete BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEntityPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityPermission"
            ("ID", "EntityID", "RoleID", "CanCreate", "CanRead", "CanUpdate", "CanDelete", "ReadRLSFilterID", "CreateRLSFilterID", "UpdateRLSFilterID", "DeleteRLSFilterID")
        VALUES
            (p_ID, p_EntityID, p_RoleID, p_CanCreate, p_CanRead, p_CanUpdate, p_CanDelete, p_ReadRLSFilterID, p_CreateRLSFilterID, p_UpdateRLSFilterID, p_DeleteRLSFilterID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityPermission"
            ("EntityID", "RoleID", "CanCreate", "CanRead", "CanUpdate", "CanDelete", "ReadRLSFilterID", "CreateRLSFilterID", "UpdateRLSFilterID", "DeleteRLSFilterID")
        VALUES
            (p_EntityID, p_RoleID, p_CanCreate, p_CanRead, p_CanUpdate, p_CanDelete, p_ReadRLSFilterID, p_CreateRLSFilterID, p_UpdateRLSFilterID, p_DeleteRLSFilterID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionResultCode"(IN p_ActionID UUID, IN p_ResultCode VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsSuccess BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwActionResultCodes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionResultCode"
            ("ID", "ActionID", "ResultCode", "IsSuccess", "Description")
        VALUES
            (p_ID, p_ActionID, p_ResultCode, p_IsSuccess, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionResultCode"
            ("ActionID", "ResultCode", "IsSuccess", "Description")
        VALUES
            (p_ActionID, p_ResultCode, p_IsSuccess, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionResultCodes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCredentialCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CredentialCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteProject"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Project"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentModel"(IN p_AgentID UUID, IN p_ModelID UUID, IN p_Active BOOLEAN, IN p_Priority INTEGER, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentModels" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentModel"
            ("ID", "AgentID", "ModelID", "Active", "Priority")
        VALUES
            (p_ID, p_AgentID, p_ModelID, p_Active, p_Priority)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentModel"
            ("AgentID", "ModelID", "Active", "Priority")
        VALUES
            (p_AgentID, p_ModelID, p_Active, p_Priority)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentModels" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCommunicationBaseMessageType"(IN p_Type VARCHAR(100), IN p_MaxBytes INTEGER, IN p_ID UUID DEFAULT NULL, IN p_SupportsAttachments BOOLEAN DEFAULT NULL, IN p_SupportsSubjectLine BOOLEAN DEFAULT NULL, IN p_SupportsHtml BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwCommunicationBaseMessageTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CommunicationBaseMessageType"
            ("ID", "Type", "SupportsAttachments", "SupportsSubjectLine", "SupportsHtml", "MaxBytes")
        VALUES
            (p_ID, p_Type, p_SupportsAttachments, p_SupportsSubjectLine, p_SupportsHtml, p_MaxBytes)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CommunicationBaseMessageType"
            ("Type", "SupportsAttachments", "SupportsSubjectLine", "SupportsHtml", "MaxBytes")
        VALUES
            (p_Type, p_SupportsAttachments, p_SupportsSubjectLine, p_SupportsHtml, p_MaxBytes)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationBaseMessageTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTaggedItem"(IN p_TagID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwTaggedItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TaggedItem"
            ("ID", "TagID", "EntityID", "RecordID")
        VALUES
            (p_ID, p_TagID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TaggedItem"
            ("TagID", "EntityID", "RecordID")
        VALUES
            (p_TagID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTaggedItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateErrorLog"(IN p_CompanyIntegrationRunID UUID, IN p_CompanyIntegrationRunDetailID UUID, IN p_Code CHAR(20), IN p_Message TEXT, IN p_CreatedBy VARCHAR(50), IN p_Status VARCHAR(10), IN p_Category VARCHAR(20), IN p_Details TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwErrorLogs" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRunDetail"(IN p_DuplicateRunID UUID, IN p_RecordID VARCHAR(500), IN p_SkippedReason TEXT, IN p_MatchErrorMessage TEXT, IN p_MergeErrorMessage TEXT, IN p_ID UUID DEFAULT NULL, IN p_MatchStatus VARCHAR(20) DEFAULT NULL, IN p_MergeStatus VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DuplicateRunDetail"
            ("ID", "DuplicateRunID", "RecordID", "MatchStatus", "SkippedReason", "MatchErrorMessage", "MergeStatus", "MergeErrorMessage")
        VALUES
            (p_ID, p_DuplicateRunID, p_RecordID, p_MatchStatus, p_SkippedReason, p_MatchErrorMessage, p_MergeStatus, p_MergeErrorMessage)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DuplicateRunDetail"
            ("DuplicateRunID", "RecordID", "MatchStatus", "SkippedReason", "MatchErrorMessage", "MergeStatus", "MergeErrorMessage")
        VALUES
            (p_DuplicateRunID, p_RecordID, p_MatchStatus, p_SkippedReason, p_MatchErrorMessage, p_MergeStatus, p_MergeErrorMessage)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailRating"(IN p_ID UUID, IN p_ConversationDetailID UUID, IN p_UserID UUID, IN p_Rating INTEGER, IN p_Comments TEXT)
RETURNS SETOF __mj."vwConversationDetailRatings" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ConversationDetailRating"
    SET
        "ConversationDetailID" = p_ConversationDetailID,
        "UserID" = p_UserID,
        "Rating" = p_Rating,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailRatings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTemplateContent"(IN p_ID UUID, IN p_TemplateID UUID, IN p_TypeID UUID, IN p_TemplateText TEXT, IN p_Priority INTEGER, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwTemplateContents" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TemplateContent"
    SET
        "TemplateID" = p_TemplateID,
        "TypeID" = p_TypeID,
        "TemplateText" = p_TemplateText,
        "Priority" = p_Priority,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTemplateContents" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityRelationship"(IN p_EntityID UUID, IN p_RelatedEntityID UUID, IN p_EntityKeyField VARCHAR(255), IN p_RelatedEntityJoinField VARCHAR(255), IN p_JoinView VARCHAR(255), IN p_JoinEntityJoinField VARCHAR(255), IN p_JoinEntityInverseJoinField VARCHAR(255), IN p_DisplayName VARCHAR(255), IN p_DisplayIcon VARCHAR(255), IN p_DisplayComponentID UUID, IN p_DisplayComponentConfiguration TEXT, IN p_AdditionalFieldsToInclude TEXT, IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL, IN p_BundleInAPI BOOLEAN DEFAULT NULL, IN p_IncludeInParentAllQuery BOOLEAN DEFAULT NULL, IN p_Type CHAR(20) DEFAULT NULL, IN p_DisplayInForm BOOLEAN DEFAULT NULL, IN p_DisplayLocation VARCHAR(50) DEFAULT NULL, IN p_DisplayIconType VARCHAR(50) DEFAULT NULL, IN p_AutoUpdateFromSchema BOOLEAN DEFAULT NULL, IN p_AutoUpdateAdditionalFieldsToInclude BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEntityRelationships" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityRelationship"
            ("ID", "EntityID", "Sequence", "RelatedEntityID", "BundleInAPI", "IncludeInParentAllQuery", "Type", "EntityKeyField", "RelatedEntityJoinField", "JoinView", "JoinEntityJoinField", "JoinEntityInverseJoinField", "DisplayInForm", "DisplayLocation", "DisplayName", "DisplayIconType", "DisplayIcon", "DisplayComponentID", "DisplayComponentConfiguration", "AutoUpdateFromSchema", "AdditionalFieldsToInclude", "AutoUpdateAdditionalFieldsToInclude")
        VALUES
            (p_ID, p_EntityID, p_Sequence, p_RelatedEntityID, p_BundleInAPI, p_IncludeInParentAllQuery, p_Type, p_EntityKeyField, p_RelatedEntityJoinField, p_JoinView, p_JoinEntityJoinField, p_JoinEntityInverseJoinField, p_DisplayInForm, p_DisplayLocation, p_DisplayName, p_DisplayIconType, p_DisplayIcon, p_DisplayComponentID, p_DisplayComponentConfiguration, p_AutoUpdateFromSchema, p_AdditionalFieldsToInclude, p_AutoUpdateAdditionalFieldsToInclude)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityRelationship"
            ("EntityID", "Sequence", "RelatedEntityID", "BundleInAPI", "IncludeInParentAllQuery", "Type", "EntityKeyField", "RelatedEntityJoinField", "JoinView", "JoinEntityJoinField", "JoinEntityInverseJoinField", "DisplayInForm", "DisplayLocation", "DisplayName", "DisplayIconType", "DisplayIcon", "DisplayComponentID", "DisplayComponentConfiguration", "AutoUpdateFromSchema", "AdditionalFieldsToInclude", "AutoUpdateAdditionalFieldsToInclude")
        VALUES
            (p_EntityID, p_Sequence, p_RelatedEntityID, p_BundleInAPI, p_IncludeInParentAllQuery, p_Type, p_EntityKeyField, p_RelatedEntityJoinField, p_JoinView, p_JoinEntityJoinField, p_JoinEntityInverseJoinField, p_DisplayInForm, p_DisplayLocation, p_DisplayName, p_DisplayIconType, p_DisplayIcon, p_DisplayComponentID, p_DisplayComponentConfiguration, p_AutoUpdateFromSchema, p_AdditionalFieldsToInclude, p_AutoUpdateAdditionalFieldsToInclude)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateWorkflowEngine"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverPath VARCHAR(500), IN p_DriverClass VARCHAR(100), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwWorkflowEngines" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."WorkflowEngine"
            ("ID", "Name", "Description", "DriverPath", "DriverClass")
        VALUES
            (p_ID, p_Name, p_Description, p_DriverPath, p_DriverClass)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."WorkflowEngine"
            ("Name", "Description", "DriverPath", "DriverClass")
        VALUES
            (p_Name, p_Description, p_DriverPath, p_DriverClass)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwWorkflowEngines" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentLearningCycle"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentLearningCycle"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompany"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description VARCHAR(200), IN p_Website VARCHAR(100), IN p_LogoURL VARCHAR(500), IN p_Domain VARCHAR(255))
RETURNS SETOF __mj."vwCompanies" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Company"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Website" = p_Website,
        "LogoURL" = p_LogoURL,
        "Domain" = p_Domain
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCompanies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentStep"(IN p_AgentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_StepType VARCHAR(20), IN p_TimeoutSeconds INTEGER, IN p_ActionID UUID, IN p_SubAgentID UUID, IN p_PromptID UUID, IN p_ActionOutputMapping TEXT, IN p_ActionInputMapping TEXT, IN p_LoopBodyType VARCHAR(50), IN p_Configuration TEXT, IN p_ID UUID DEFAULT NULL, IN p_StartingStep BOOLEAN DEFAULT NULL, IN p_RetryCount INTEGER DEFAULT NULL, IN p_OnErrorBehavior VARCHAR(20) DEFAULT NULL, IN p_PositionX INTEGER DEFAULT NULL, IN p_PositionY INTEGER DEFAULT NULL, IN p_Width INTEGER DEFAULT NULL, IN p_Height INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentSteps" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentStep"
            ("ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration")
        VALUES
            (p_ID, p_AgentID, p_Name, p_Description, p_StepType, p_StartingStep, p_TimeoutSeconds, p_RetryCount, p_OnErrorBehavior, p_ActionID, p_SubAgentID, p_PromptID, p_ActionOutputMapping, p_PositionX, p_PositionY, p_Width, p_Height, p_Status, p_ActionInputMapping, p_LoopBodyType, p_Configuration)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentStep"
            ("AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration")
        VALUES
            (p_AgentID, p_Name, p_Description, p_StepType, p_StartingStep, p_TimeoutSeconds, p_RetryCount, p_OnErrorBehavior, p_ActionID, p_SubAgentID, p_PromptID, p_ActionOutputMapping, p_PositionX, p_PositionY, p_Width, p_Height, p_Status, p_ActionInputMapping, p_LoopBodyType, p_Configuration)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentSteps" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecommendation"(IN p_ID UUID, IN p_RecommendationRunID UUID, IN p_SourceEntityID UUID, IN p_SourceEntityRecordID TEXT)
RETURNS SETOF __mj."vwRecommendations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Recommendation"
    SET
        "RecommendationRunID" = p_RecommendationRunID,
        "SourceEntityID" = p_SourceEntityID,
        "SourceEntityRecordID" = p_SourceEntityRecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecommendations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationArtifact"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ConversationID UUID, IN p_ArtifactTypeID UUID, IN p_SharingScope VARCHAR(50), IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwConversationArtifacts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationArtifact"
            ("ID", "Name", "Description", "ConversationID", "ArtifactTypeID", "SharingScope", "Comments")
        VALUES
            (p_ID, p_Name, p_Description, p_ConversationID, p_ArtifactTypeID, p_SharingScope, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationArtifact"
            ("Name", "Description", "ConversationID", "ArtifactTypeID", "SharingScope", "Comments")
        VALUES
            (p_Name, p_Description, p_ConversationID, p_ArtifactTypeID, p_SharingScope, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationArtifacts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueryPermission"(IN p_QueryID UUID, IN p_RoleID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwQueryPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueryPermission"
            ("ID", "QueryID", "RoleID")
        VALUES
            (p_ID, p_QueryID, p_RoleID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueryPermission"
            ("QueryID", "RoleID")
        VALUES
            (p_QueryID, p_RoleID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueryPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DuplicateRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateReportUserState"(IN p_ID UUID, IN p_ReportID UUID, IN p_UserID UUID, IN p_ReportState TEXT)
RETURNS SETOF __mj."vwReportUserStates" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ReportUserState"
    SET
        "ReportID" = p_ReportID,
        "UserID" = p_UserID,
        "ReportState" = p_ReportState
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwReportUserStates" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEnvironment"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_IsDefault BOOLEAN, IN p_Settings TEXT)
RETURNS SETOF __mj."vwEnvironments" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Environment"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "IsDefault" = p_IsDefault,
        "Settings" = p_Settings
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEnvironments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueryCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."QueryCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentDataSource"(IN p_AgentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_EntityName VARCHAR(255), IN p_ExtraFilter TEXT, IN p_OrderBy VARCHAR(500), IN p_FieldsToRetrieve TEXT, IN p_ResultType VARCHAR(20), IN p_QueryName VARCHAR(255), IN p_CategoryPath VARCHAR(500), IN p_Parameters TEXT, IN p_MaxRows INTEGER, IN p_CacheTimeoutSeconds INTEGER, IN p_DestinationPath VARCHAR(500), IN p_ID UUID DEFAULT NULL, IN p_SourceType VARCHAR(20) DEFAULT NULL, IN p_ExecutionOrder INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_CachePolicy VARCHAR(20) DEFAULT NULL, IN p_DestinationType VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentDataSources" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentDataSource"
            ("ID", "AgentID", "Name", "Description", "SourceType", "EntityName", "ExtraFilter", "OrderBy", "FieldsToRetrieve", "ResultType", "QueryName", "CategoryPath", "Parameters", "MaxRows", "ExecutionOrder", "Status", "CachePolicy", "CacheTimeoutSeconds", "DestinationType", "DestinationPath")
        VALUES
            (p_ID, p_AgentID, p_Name, p_Description, p_SourceType, p_EntityName, p_ExtraFilter, p_OrderBy, p_FieldsToRetrieve, p_ResultType, p_QueryName, p_CategoryPath, p_Parameters, p_MaxRows, p_ExecutionOrder, p_Status, p_CachePolicy, p_CacheTimeoutSeconds, p_DestinationType, p_DestinationPath)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentDataSource"
            ("AgentID", "Name", "Description", "SourceType", "EntityName", "ExtraFilter", "OrderBy", "FieldsToRetrieve", "ResultType", "QueryName", "CategoryPath", "Parameters", "MaxRows", "ExecutionOrder", "Status", "CachePolicy", "CacheTimeoutSeconds", "DestinationType", "DestinationPath")
        VALUES
            (p_AgentID, p_Name, p_Description, p_SourceType, p_EntityName, p_ExtraFilter, p_OrderBy, p_FieldsToRetrieve, p_ResultType, p_QueryName, p_CategoryPath, p_Parameters, p_MaxRows, p_ExecutionOrder, p_Status, p_CachePolicy, p_CacheTimeoutSeconds, p_DestinationType, p_DestinationPath)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentDataSources" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemAttribute"(IN p_ID UUID, IN p_ContentItemID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT)
RETURNS SETOF __mj."vwContentItemAttributes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentItemAttribute"
    SET
        "ContentItemID" = p_ContentItemID,
        "Name" = p_Name,
        "Value" = p_Value
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentItemAttributes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelAction"(IN p_ID UUID, IN p_AIModelID UUID, IN p_AIActionID UUID, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwAIModelActions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelAction"
    SET
        "AIModelID" = p_AIModelID,
        "AIActionID" = p_AIActionID,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelActions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateReportSnapshot"(IN p_ReportID UUID, IN p_ResultSet TEXT, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwReportSnapshots" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ReportSnapshot"
            ("ID", "ReportID", "ResultSet", "UserID")
        VALUES
            (p_ID, p_ReportID, p_ResultSet, p_UserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ReportSnapshot"
            ("ReportID", "ResultSet", "UserID")
        VALUES
            (p_ReportID, p_ResultSet, p_UserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwReportSnapshots" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTag"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Tag"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordMergeDeletionLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecordMergeDeletionLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCollectionPermission"(IN p_CollectionID UUID, IN p_UserID UUID, IN p_SharedByUserID UUID, IN p_ID UUID DEFAULT NULL, IN p_CanRead BOOLEAN DEFAULT NULL, IN p_CanShare BOOLEAN DEFAULT NULL, IN p_CanEdit BOOLEAN DEFAULT NULL, IN p_CanDelete BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwCollectionPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CollectionPermission"
            ("ID", "CollectionID", "UserID", "CanRead", "CanShare", "CanEdit", "CanDelete", "SharedByUserID")
        VALUES
            (p_ID, p_CollectionID, p_UserID, p_CanRead, p_CanShare, p_CanEdit, p_CanDelete, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CollectionPermission"
            ("CollectionID", "UserID", "CanRead", "CanShare", "CanEdit", "CanDelete", "SharedByUserID")
        VALUES
            (p_CollectionID, p_UserID, p_CanRead, p_CanShare, p_CanEdit, p_CanDelete, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCollectionPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIConfigurationParam"(IN p_ID UUID, IN p_ConfigurationID UUID, IN p_Name VARCHAR(100), IN p_Type VARCHAR(20), IN p_Value TEXT, IN p_Description TEXT)
RETURNS SETOF __mj."vwAIConfigurationParams" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIConfigurationParam"
    SET
        "ConfigurationID" = p_ConfigurationID,
        "Name" = p_Name,
        "Type" = p_Type,
        "Value" = p_Value,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIConfigurationParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCommunicationLog"(IN p_CommunicationProviderID UUID, IN p_CommunicationProviderMessageTypeID UUID, IN p_CommunicationRunID UUID, IN p_Direction VARCHAR(20), IN p_MessageDate TIMESTAMPTZ, IN p_MessageContent TEXT, IN p_ErrorMessage TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwCommunicationLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CommunicationLog"
            ("ID", "CommunicationProviderID", "CommunicationProviderMessageTypeID", "CommunicationRunID", "Direction", "MessageDate", "Status", "MessageContent", "ErrorMessage")
        VALUES
            (p_ID, p_CommunicationProviderID, p_CommunicationProviderMessageTypeID, p_CommunicationRunID, p_Direction, p_MessageDate, p_Status, p_MessageContent, p_ErrorMessage)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CommunicationLog"
            ("CommunicationProviderID", "CommunicationProviderMessageTypeID", "CommunicationRunID", "Direction", "MessageDate", "Status", "MessageContent", "ErrorMessage")
        VALUES
            (p_CommunicationProviderID, p_CommunicationProviderMessageTypeID, p_CommunicationRunID, p_Direction, p_MessageDate, p_Status, p_MessageContent, p_ErrorMessage)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCollectionArtifact"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CollectionArtifact"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionParam"(IN p_ActionID UUID, IN p_Name VARCHAR(255), IN p_DefaultValue TEXT, IN p_Type CHAR(10), IN p_ValueType VARCHAR(30), IN p_Description TEXT, IN p_MediaModality VARCHAR(20), IN p_ID UUID DEFAULT NULL, IN p_IsArray BOOLEAN DEFAULT NULL, IN p_IsRequired BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwActionParams" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionParam"
            ("ID", "ActionID", "Name", "DefaultValue", "Type", "ValueType", "IsArray", "Description", "IsRequired", "MediaModality")
        VALUES
            (p_ID, p_ActionID, p_Name, p_DefaultValue, p_Type, p_ValueType, p_IsArray, p_Description, p_IsRequired, p_MediaModality)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionParam"
            ("ActionID", "Name", "DefaultValue", "Type", "ValueType", "IsArray", "Description", "IsRequired", "MediaModality")
        VALUES
            (p_ActionID, p_Name, p_DefaultValue, p_Type, p_ValueType, p_IsArray, p_Description, p_IsRequired, p_MediaModality)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionParams" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRecordMap"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CompanyIntegrationRecordMap"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAccessControlRule"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AccessControlRule"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentModality"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentModality"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentConfiguration"(IN p_ID UUID, IN p_AgentID UUID, IN p_Name VARCHAR(100), IN p_DisplayName VARCHAR(200), IN p_Description TEXT, IN p_AIConfigurationID UUID, IN p_IsDefault BOOLEAN, IN p_Priority INTEGER, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwAIAgentConfigurations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentConfiguration"
    SET
        "AgentID" = p_AgentID,
        "Name" = p_Name,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "AIConfigurationID" = p_AIConfigurationID,
        "IsDefault" = p_IsDefault,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentConfigurations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionParam"(IN p_ID UUID, IN p_ActionID UUID, IN p_Name VARCHAR(255), IN p_DefaultValue TEXT, IN p_Type CHAR(10), IN p_ValueType VARCHAR(30), IN p_IsArray BOOLEAN, IN p_Description TEXT, IN p_IsRequired BOOLEAN, IN p_MediaModality VARCHAR(20))
RETURNS SETOF __mj."vwActionParams" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionParam"
    SET
        "ActionID" = p_ActionID,
        "Name" = p_Name,
        "DefaultValue" = p_DefaultValue,
        "Type" = p_Type,
        "ValueType" = p_ValueType,
        "IsArray" = p_IsArray,
        "Description" = p_Description,
        "IsRequired" = p_IsRequired,
        "MediaModality" = p_MediaModality
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactVersion"(IN p_ArtifactID UUID, IN p_VersionNumber INTEGER, IN p_Content TEXT, IN p_Configuration TEXT, IN p_Comments TEXT, IN p_UserID UUID, IN p_ContentHash VARCHAR(500), IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwArtifactVersions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ArtifactVersion"
            ("ID", "ArtifactID", "VersionNumber", "Content", "Configuration", "Comments", "UserID", "ContentHash", "Name", "Description")
        VALUES
            (p_ID, p_ArtifactID, p_VersionNumber, p_Content, p_Configuration, p_Comments, p_UserID, p_ContentHash, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ArtifactVersion"
            ("ArtifactID", "VersionNumber", "Content", "Configuration", "Comments", "UserID", "ContentHash", "Name", "Description")
        VALUES
            (p_ArtifactID, p_VersionNumber, p_Content, p_Configuration, p_Comments, p_UserID, p_ContentHash, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwArtifactVersions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordMergeLog"(IN p_ID UUID, IN p_EntityID UUID, IN p_SurvivingRecordID VARCHAR(450), IN p_InitiatedByUserID UUID, IN p_ApprovalStatus VARCHAR(10), IN p_ApprovedByUserID UUID, IN p_ProcessingStatus VARCHAR(10), IN p_ProcessingStartedAt TIMESTAMPTZ, IN p_ProcessingEndedAt TIMESTAMPTZ, IN p_ProcessingLog TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwRecordMergeLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecordMergeLog"
    SET
        "EntityID" = p_EntityID,
        "SurvivingRecordID" = p_SurvivingRecordID,
        "InitiatedByUserID" = p_InitiatedByUserID,
        "ApprovalStatus" = p_ApprovalStatus,
        "ApprovedByUserID" = p_ApprovedByUserID,
        "ProcessingStatus" = p_ProcessingStatus,
        "ProcessingStartedAt" = p_ProcessingStartedAt,
        "ProcessingEndedAt" = p_ProcessingEndedAt,
        "ProcessingLog" = p_ProcessingLog,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecordMergeLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAICredentialBinding"(IN p_CredentialID UUID, IN p_BindingType VARCHAR(20), IN p_AIVendorID UUID, IN p_AIModelVendorID UUID, IN p_AIPromptModelID UUID, IN p_ID UUID DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAICredentialBindings" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AICredentialBinding"
            ("ID", "CredentialID", "BindingType", "AIVendorID", "AIModelVendorID", "AIPromptModelID", "Priority", "IsActive")
        VALUES
            (p_ID, p_CredentialID, p_BindingType, p_AIVendorID, p_AIModelVendorID, p_AIPromptModelID, p_Priority, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AICredentialBinding"
            ("CredentialID", "BindingType", "AIVendorID", "AIModelVendorID", "AIPromptModelID", "Priority", "IsActive")
        VALUES
            (p_CredentialID, p_BindingType, p_AIVendorID, p_AIModelVendorID, p_AIPromptModelID, p_Priority, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAICredentialBindings" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateResourcePermission"(IN p_ResourceTypeID UUID, IN p_ResourceRecordID VARCHAR(255), IN p_Type VARCHAR(10), IN p_StartSharingAt TIMESTAMPTZ, IN p_EndSharingAt TIMESTAMPTZ, IN p_RoleID UUID, IN p_UserID UUID, IN p_PermissionLevel VARCHAR(20), IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwResourcePermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ResourcePermission"
            ("ID", "ResourceTypeID", "ResourceRecordID", "Type", "StartSharingAt", "EndSharingAt", "RoleID", "UserID", "PermissionLevel", "Status")
        VALUES
            (p_ID, p_ResourceTypeID, p_ResourceRecordID, p_Type, p_StartSharingAt, p_EndSharingAt, p_RoleID, p_UserID, p_PermissionLevel, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ResourcePermission"
            ("ResourceTypeID", "ResourceRecordID", "Type", "StartSharingAt", "EndSharingAt", "RoleID", "UserID", "PermissionLevel", "Status")
        VALUES
            (p_ResourceTypeID, p_ResourceRecordID, p_Type, p_StartSharingAt, p_EndSharingAt, p_RoleID, p_UserID, p_PermissionLevel, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwResourcePermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserSetting"(IN p_ID UUID, IN p_UserID UUID, IN p_Setting VARCHAR(255), IN p_Value TEXT)
RETURNS SETOF __mj."vwUserSettings" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserSetting"
    SET
        "UserID" = p_UserID,
        "Setting" = p_Setting,
        "Value" = p_Value
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserSettings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIVendorTypeDefinition"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIVendorTypeDefinition"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateWorkspace"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_UserID UUID, IN p_Configuration TEXT)
RETURNS SETOF __mj."vwWorkspaces" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Workspace"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "UserID" = p_UserID,
        "Configuration" = p_Configuration
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwWorkspaces" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityCommunicationMessageType"(IN p_EntityID UUID, IN p_BaseMessageTypeID UUID, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEntityCommunicationMessageTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityCommunicationMessageType"
            ("ID", "EntityID", "BaseMessageTypeID", "IsActive")
        VALUES
            (p_ID, p_EntityID, p_BaseMessageTypeID, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityCommunicationMessageType"
            ("EntityID", "BaseMessageTypeID", "IsActive")
        VALUES
            (p_EntityID, p_BaseMessageTypeID, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityCommunicationMessageTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueue"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Queue"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateApplicationEntity"(IN p_ApplicationID UUID, IN p_EntityID UUID, IN p_Sequence INTEGER, IN p_ID UUID DEFAULT NULL, IN p_DefaultForNewUser BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwApplicationEntities" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ApplicationEntity"
            ("ID", "ApplicationID", "EntityID", "Sequence", "DefaultForNewUser")
        VALUES
            (p_ID, p_ApplicationID, p_EntityID, p_Sequence, p_DefaultForNewUser)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ApplicationEntity"
            ("ApplicationID", "EntityID", "Sequence", "DefaultForNewUser")
        VALUES
            (p_ApplicationID, p_EntityID, p_Sequence, p_DefaultForNewUser)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUser"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."User"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEmployeeSkill"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EmployeeSkill"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionParam"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionParam"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityPermission"(IN p_ID UUID, IN p_EntityID UUID, IN p_RoleID UUID, IN p_CanCreate BOOLEAN, IN p_CanRead BOOLEAN, IN p_CanUpdate BOOLEAN, IN p_CanDelete BOOLEAN, IN p_ReadRLSFilterID UUID, IN p_CreateRLSFilterID UUID, IN p_UpdateRLSFilterID UUID, IN p_DeleteRLSFilterID UUID)
RETURNS SETOF __mj."vwEntityPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityPermission"
    SET
        "EntityID" = p_EntityID,
        "RoleID" = p_RoleID,
        "CanCreate" = p_CanCreate,
        "CanRead" = p_CanRead,
        "CanUpdate" = p_CanUpdate,
        "CanDelete" = p_CanDelete,
        "ReadRLSFilterID" = p_ReadRLSFilterID,
        "CreateRLSFilterID" = p_CreateRLSFilterID,
        "UpdateRLSFilterID" = p_UpdateRLSFilterID,
        "DeleteRLSFilterID" = p_DeleteRLSFilterID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_AIModelID UUID, IN p_MinTags INTEGER, IN p_MaxTags INTEGER, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentType"
            ("ID", "Name", "Description", "AIModelID", "MinTags", "MaxTags")
        VALUES
            (p_ID, p_Name, p_Description, p_AIModelID, p_MinTags, p_MaxTags)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentType"
            ("Name", "Description", "AIModelID", "MinTags", "MaxTags")
        VALUES
            (p_Name, p_Description, p_AIModelID, p_MinTags, p_MaxTags)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledJobRun"(IN p_ID UUID, IN p_ScheduledJobID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_Details TEXT, IN p_ExecutedByUserID UUID, IN p_QueuedAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwScheduledJobRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ScheduledJobRun"
    SET
        "ScheduledJobID" = p_ScheduledJobID,
        "StartedAt" = p_StartedAt,
        "CompletedAt" = p_CompletedAt,
        "Status" = p_Status,
        "Success" = p_Success,
        "ErrorMessage" = p_ErrorMessage,
        "Details" = p_Details,
        "ExecutedByUserID" = p_ExecutedByUserID,
        "QueuedAt" = p_QueuedAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwScheduledJobRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateWorkflowEngine"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverPath VARCHAR(500), IN p_DriverClass VARCHAR(100))
RETURNS SETOF __mj."vwWorkflowEngines" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."WorkflowEngine"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverPath" = p_DriverPath,
        "DriverClass" = p_DriverClass
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwWorkflowEngines" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDataContextItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DataContextItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCommunicationBaseMessageType"(IN p_ID UUID, IN p_Type VARCHAR(100), IN p_SupportsAttachments BOOLEAN, IN p_SupportsSubjectLine BOOLEAN, IN p_SupportsHtml BOOLEAN, IN p_MaxBytes INTEGER)
RETURNS SETOF __mj."vwCommunicationBaseMessageTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CommunicationBaseMessageType"
    SET
        "Type" = p_Type,
        "SupportsAttachments" = p_SupportsAttachments,
        "SupportsSubjectLine" = p_SupportsSubjectLine,
        "SupportsHtml" = p_SupportsHtml,
        "MaxBytes" = p_MaxBytes
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationBaseMessageTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRunAPILog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CompanyIntegrationRunAPILog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueryPermission"(IN p_ID UUID, IN p_QueryID UUID, IN p_RoleID UUID)
RETURNS SETOF __mj."vwQueryPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."QueryPermission"
    SET
        "QueryID" = p_QueryID,
        "RoleID" = p_RoleID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueryPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateComponentRegistry"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_URI VARCHAR(500), IN p_Type VARCHAR(50), IN p_APIVersion VARCHAR(50), IN p_Status VARCHAR(50), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwComponentRegistries" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ComponentRegistry"
            ("ID", "Name", "Description", "URI", "Type", "APIVersion", "Status")
        VALUES
            (p_ID, p_Name, p_Description, p_URI, p_Type, p_APIVersion, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ComponentRegistry"
            ("Name", "Description", "URI", "Type", "APIVersion", "Status")
        VALUES
            (p_Name, p_Description, p_URI, p_Type, p_APIVersion, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwComponentRegistries" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifactPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ConversationArtifactPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifact"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ConversationArtifact"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRunMedia"(IN p_AgentRunID UUID, IN p_SourcePromptRunMediaID UUID, IN p_ModalityID UUID, IN p_MimeType VARCHAR(100), IN p_FileName VARCHAR(255), IN p_FileSizeBytes INTEGER, IN p_Width INTEGER, IN p_Height INTEGER, IN p_DurationSeconds NUMERIC(10,2), IN p_InlineData TEXT, IN p_FileID UUID, IN p_ThumbnailBase64 TEXT, IN p_Label VARCHAR(255), IN p_Metadata TEXT, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_DisplayOrder INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentRunMedias" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRunMedia"
            ("ID", "AgentRunID", "SourcePromptRunMediaID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "ThumbnailBase64", "Label", "Metadata", "DisplayOrder", "Description")
        VALUES
            (p_ID, p_AgentRunID, p_SourcePromptRunMediaID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, p_ThumbnailBase64, p_Label, p_Metadata, p_DisplayOrder, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentRunMedia"
            ("AgentRunID", "SourcePromptRunMediaID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "ThumbnailBase64", "Label", "Metadata", "DisplayOrder", "Description")
        VALUES
            (p_AgentRunID, p_SourcePromptRunMediaID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, p_ThumbnailBase64, p_Label, p_Metadata, p_DisplayOrder, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRunMedias" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEncryptionKeySource"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255), IN p_DriverImportPath VARCHAR(500), IN p_ConfigTemplate TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwEncryptionKeySources" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EncryptionKeySource"
            ("ID", "Name", "Description", "DriverClass", "DriverImportPath", "ConfigTemplate", "IsActive", "Status")
        VALUES
            (p_ID, p_Name, p_Description, p_DriverClass, p_DriverImportPath, p_ConfigTemplate, p_IsActive, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EncryptionKeySource"
            ("Name", "Description", "DriverClass", "DriverImportPath", "ConfigTemplate", "IsActive", "Status")
        VALUES
            (p_Name, p_Description, p_DriverClass, p_DriverImportPath, p_ConfigTemplate, p_IsActive, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEncryptionKeySources" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentModel"(IN p_ID UUID, IN p_AgentID UUID, IN p_ModelID UUID, IN p_Active BOOLEAN, IN p_Priority INTEGER)
RETURNS SETOF __mj."vwAIAgentModels" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentModel"
    SET
        "AgentID" = p_AgentID,
        "ModelID" = p_ModelID,
        "Active" = p_Active,
        "Priority" = p_Priority
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentModels" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionResultCode"(IN p_ID UUID, IN p_ActionID UUID, IN p_ResultCode VARCHAR(255), IN p_IsSuccess BOOLEAN, IN p_Description TEXT)
RETURNS SETOF __mj."vwActionResultCodes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionResultCode"
    SET
        "ActionID" = p_ActionID,
        "ResultCode" = p_ResultCode,
        "IsSuccess" = p_IsSuccess,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionResultCodes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityRelationship"(IN p_ID UUID, IN p_EntityID UUID, IN p_Sequence INTEGER, IN p_RelatedEntityID UUID, IN p_BundleInAPI BOOLEAN, IN p_IncludeInParentAllQuery BOOLEAN, IN p_Type CHAR(20), IN p_EntityKeyField VARCHAR(255), IN p_RelatedEntityJoinField VARCHAR(255), IN p_JoinView VARCHAR(255), IN p_JoinEntityJoinField VARCHAR(255), IN p_JoinEntityInverseJoinField VARCHAR(255), IN p_DisplayInForm BOOLEAN, IN p_DisplayLocation VARCHAR(50), IN p_DisplayName VARCHAR(255), IN p_DisplayIconType VARCHAR(50), IN p_DisplayIcon VARCHAR(255), IN p_DisplayComponentID UUID, IN p_DisplayComponentConfiguration TEXT, IN p_AutoUpdateFromSchema BOOLEAN, IN p_AdditionalFieldsToInclude TEXT, IN p_AutoUpdateAdditionalFieldsToInclude BOOLEAN)
RETURNS SETOF __mj."vwEntityRelationships" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentDataSource"(IN p_ID UUID, IN p_AgentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_SourceType VARCHAR(20), IN p_EntityName VARCHAR(255), IN p_ExtraFilter TEXT, IN p_OrderBy VARCHAR(500), IN p_FieldsToRetrieve TEXT, IN p_ResultType VARCHAR(20), IN p_QueryName VARCHAR(255), IN p_CategoryPath VARCHAR(500), IN p_Parameters TEXT, IN p_MaxRows INTEGER, IN p_ExecutionOrder INTEGER, IN p_Status VARCHAR(20), IN p_CachePolicy VARCHAR(20), IN p_CacheTimeoutSeconds INTEGER, IN p_DestinationType VARCHAR(20), IN p_DestinationPath VARCHAR(500))
RETURNS SETOF __mj."vwAIAgentDataSources" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentDataSource"
    SET
        "AgentID" = p_AgentID,
        "Name" = p_Name,
        "Description" = p_Description,
        "SourceType" = p_SourceType,
        "EntityName" = p_EntityName,
        "ExtraFilter" = p_ExtraFilter,
        "OrderBy" = p_OrderBy,
        "FieldsToRetrieve" = p_FieldsToRetrieve,
        "ResultType" = p_ResultType,
        "QueryName" = p_QueryName,
        "CategoryPath" = p_CategoryPath,
        "Parameters" = p_Parameters,
        "MaxRows" = p_MaxRows,
        "ExecutionOrder" = p_ExecutionOrder,
        "Status" = p_Status,
        "CachePolicy" = p_CachePolicy,
        "CacheTimeoutSeconds" = p_CacheTimeoutSeconds,
        "DestinationType" = p_DestinationType,
        "DestinationPath" = p_DestinationPath
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentDataSources" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeletePublicLink"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."PublicLink"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRunDetail"(IN p_ID UUID, IN p_DuplicateRunID UUID, IN p_RecordID VARCHAR(500), IN p_MatchStatus VARCHAR(20), IN p_SkippedReason TEXT, IN p_MatchErrorMessage TEXT, IN p_MergeStatus VARCHAR(20), IN p_MergeErrorMessage TEXT)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DuplicateRunDetail"
    SET
        "DuplicateRunID" = p_DuplicateRunID,
        "RecordID" = p_RecordID,
        "MatchStatus" = p_MatchStatus,
        "SkippedReason" = p_SkippedReason,
        "MatchErrorMessage" = p_MatchErrorMessage,
        "MergeStatus" = p_MergeStatus,
        "MergeErrorMessage" = p_MergeErrorMessage
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRunMedia"(IN p_ID UUID, IN p_AgentRunID UUID, IN p_SourcePromptRunMediaID UUID, IN p_ModalityID UUID, IN p_MimeType VARCHAR(100), IN p_FileName VARCHAR(255), IN p_FileSizeBytes INTEGER, IN p_Width INTEGER, IN p_Height INTEGER, IN p_DurationSeconds NUMERIC(10,2), IN p_InlineData TEXT, IN p_FileID UUID, IN p_ThumbnailBase64 TEXT, IN p_Label VARCHAR(255), IN p_Metadata TEXT, IN p_DisplayOrder INTEGER, IN p_Description TEXT)
RETURNS SETOF __mj."vwAIAgentRunMedias" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentRunMedia"
    SET
        "AgentRunID" = p_AgentRunID,
        "SourcePromptRunMediaID" = p_SourcePromptRunMediaID,
        "ModalityID" = p_ModalityID,
        "MimeType" = p_MimeType,
        "FileName" = p_FileName,
        "FileSizeBytes" = p_FileSizeBytes,
        "Width" = p_Width,
        "Height" = p_Height,
        "DurationSeconds" = p_DurationSeconds,
        "InlineData" = p_InlineData,
        "FileID" = p_FileID,
        "ThumbnailBase64" = p_ThumbnailBase64,
        "Label" = p_Label,
        "Metadata" = p_Metadata,
        "DisplayOrder" = p_DisplayOrder,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRunMedias" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateReportSnapshot"(IN p_ID UUID, IN p_ReportID UUID, IN p_ResultSet TEXT, IN p_UserID UUID)
RETURNS SETOF __mj."vwReportSnapshots" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ReportSnapshot"
    SET
        "ReportID" = p_ReportID,
        "ResultSet" = p_ResultSet,
        "UserID" = p_UserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwReportSnapshots" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentStep"(IN p_ID UUID, IN p_AgentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_StepType VARCHAR(20), IN p_StartingStep BOOLEAN, IN p_TimeoutSeconds INTEGER, IN p_RetryCount INTEGER, IN p_OnErrorBehavior VARCHAR(20), IN p_ActionID UUID, IN p_SubAgentID UUID, IN p_PromptID UUID, IN p_ActionOutputMapping TEXT, IN p_PositionX INTEGER, IN p_PositionY INTEGER, IN p_Width INTEGER, IN p_Height INTEGER, IN p_Status VARCHAR(20), IN p_ActionInputMapping TEXT, IN p_LoopBodyType VARCHAR(50), IN p_Configuration TEXT)
RETURNS SETOF __mj."vwAIAgentSteps" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentStep"
    SET
        "AgentID" = p_AgentID,
        "Name" = p_Name,
        "Description" = p_Description,
        "StepType" = p_StepType,
        "StartingStep" = p_StartingStep,
        "TimeoutSeconds" = p_TimeoutSeconds,
        "RetryCount" = p_RetryCount,
        "OnErrorBehavior" = p_OnErrorBehavior,
        "ActionID" = p_ActionID,
        "SubAgentID" = p_SubAgentID,
        "PromptID" = p_PromptID,
        "ActionOutputMapping" = p_ActionOutputMapping,
        "PositionX" = p_PositionX,
        "PositionY" = p_PositionY,
        "Width" = p_Width,
        "Height" = p_Height,
        "Status" = p_Status,
        "ActionInputMapping" = p_ActionInputMapping,
        "LoopBodyType" = p_LoopBodyType,
        "Configuration" = p_Configuration
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentSteps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCommunicationProvider"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_SupportsSending BOOLEAN DEFAULT NULL, IN p_SupportsReceiving BOOLEAN DEFAULT NULL, IN p_SupportsScheduledSending BOOLEAN DEFAULT NULL, IN p_SupportsForwarding BOOLEAN DEFAULT NULL, IN p_SupportsReplying BOOLEAN DEFAULT NULL, IN p_SupportsDrafts BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwCommunicationProviders" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CommunicationProvider"
            ("ID", "Name", "Description", "Status", "SupportsSending", "SupportsReceiving", "SupportsScheduledSending", "SupportsForwarding", "SupportsReplying", "SupportsDrafts")
        VALUES
            (p_ID, p_Name, p_Description, p_Status, p_SupportsSending, p_SupportsReceiving, p_SupportsScheduledSending, p_SupportsForwarding, p_SupportsReplying, p_SupportsDrafts)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CommunicationProvider"
            ("Name", "Description", "Status", "SupportsSending", "SupportsReceiving", "SupportsScheduledSending", "SupportsForwarding", "SupportsReplying", "SupportsDrafts")
        VALUES
            (p_Name, p_Description, p_Status, p_SupportsSending, p_SupportsReceiving, p_SupportsScheduledSending, p_SupportsForwarding, p_SupportsReplying, p_SupportsDrafts)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationProviders" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionExecutionLog"(IN p_ActionID UUID, IN p_EndedAt TIMESTAMPTZ, IN p_Params TEXT, IN p_ResultCode VARCHAR(255), IN p_UserID UUID, IN p_RetentionPeriod INTEGER, IN p_Message TEXT, IN p_ID UUID DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwActionExecutionLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionExecutionLog"
            ("ID", "ActionID", "StartedAt", "EndedAt", "Params", "ResultCode", "UserID", "RetentionPeriod", "Message")
        VALUES
            (p_ID, p_ActionID, p_StartedAt, p_EndedAt, p_Params, p_ResultCode, p_UserID, p_RetentionPeriod, p_Message)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionExecutionLog"
            ("ActionID", "StartedAt", "EndedAt", "Params", "ResultCode", "UserID", "RetentionPeriod", "Message")
        VALUES
            (p_ActionID, p_StartedAt, p_EndedAt, p_Params, p_ResultCode, p_UserID, p_RetentionPeriod, p_Message)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionExecutionLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateErrorLog"(IN p_ID UUID, IN p_CompanyIntegrationRunID UUID, IN p_CompanyIntegrationRunDetailID UUID, IN p_Code CHAR(20), IN p_Message TEXT, IN p_CreatedBy VARCHAR(50), IN p_Status VARCHAR(10), IN p_Category VARCHAR(20), IN p_Details TEXT)
RETURNS SETOF __mj."vwErrorLogs" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TemplateCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegration"(IN p_Name VARCHAR(100), IN p_Description VARCHAR(255), IN p_NavigationBaseURL VARCHAR(500), IN p_ClassName VARCHAR(100), IN p_ImportPath VARCHAR(100), IN p_BatchMaxRequestCount INTEGER DEFAULT NULL, IN p_BatchRequestWaitTime INTEGER DEFAULT NULL, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwIntegrations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Integration"
            ("ID", "Name", "Description", "NavigationBaseURL", "ClassName", "ImportPath", "BatchMaxRequestCount", "BatchRequestWaitTime")
        VALUES
            (p_ID, p_Name, p_Description, p_NavigationBaseURL, p_ClassName, p_ImportPath, p_BatchMaxRequestCount, p_BatchRequestWaitTime)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Integration"
            ("Name", "Description", "NavigationBaseURL", "ClassName", "ImportPath", "BatchMaxRequestCount", "BatchRequestWaitTime")
        VALUES
            (p_Name, p_Description, p_NavigationBaseURL, p_ClassName, p_ImportPath, p_BatchMaxRequestCount, p_BatchRequestWaitTime)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwIntegrations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIVendorTypeDefinition"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIVendorTypeDefinitions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIVendorTypeDefinition"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIVendorTypeDefinition"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIVendorTypeDefinitions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTaggedItem"(IN p_ID UUID, IN p_TagID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450))
RETURNS SETOF __mj."vwTaggedItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TaggedItem"
    SET
        "TagID" = p_TagID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTaggedItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionFilter"(IN p_EntityActionID UUID, IN p_ActionFilterID UUID, IN p_Sequence INTEGER, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwEntityActionFilters" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityActionFilter"
            ("ID", "EntityActionID", "ActionFilterID", "Sequence", "Status")
        VALUES
            (p_ID, p_EntityActionID, p_ActionFilterID, p_Sequence, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityActionFilter"
            ("EntityActionID", "ActionFilterID", "Sequence", "Status")
        VALUES
            (p_EntityActionID, p_ActionFilterID, p_Sequence, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentModel"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentModel"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunMedia"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentRunMedia"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactVersion"(IN p_ID UUID, IN p_ArtifactID UUID, IN p_VersionNumber INTEGER, IN p_Content TEXT, IN p_Configuration TEXT, IN p_Comments TEXT, IN p_UserID UUID, IN p_ContentHash VARCHAR(500), IN p_Name VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwArtifactVersions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ArtifactVersion"
    SET
        "ArtifactID" = p_ArtifactID,
        "VersionNumber" = p_VersionNumber,
        "Content" = p_Content,
        "Configuration" = p_Configuration,
        "Comments" = p_Comments,
        "UserID" = p_UserID,
        "ContentHash" = p_ContentHash,
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwArtifactVersions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentAction"(IN p_AgentID UUID, IN p_ActionID UUID, IN p_MinExecutionsPerRun INTEGER, IN p_MaxExecutionsPerRun INTEGER, IN p_ResultExpirationTurns INTEGER, IN p_CompactMode VARCHAR(20), IN p_CompactLength INTEGER, IN p_CompactPromptID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(15) DEFAULT NULL, IN p_ResultExpirationMode VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentActions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentAction"
            ("ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID")
        VALUES
            (p_ID, p_AgentID, p_ActionID, p_Status, p_MinExecutionsPerRun, p_MaxExecutionsPerRun, p_ResultExpirationTurns, p_ResultExpirationMode, p_CompactMode, p_CompactLength, p_CompactPromptID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentAction"
            ("AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID")
        VALUES
            (p_AgentID, p_ActionID, p_Status, p_MinExecutionsPerRun, p_MaxExecutionsPerRun, p_ResultExpirationTurns, p_ResultExpirationMode, p_CompactMode, p_CompactLength, p_CompactPromptID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentActions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_AIModelID UUID, IN p_MinTags INTEGER, IN p_MaxTags INTEGER)
RETURNS SETOF __mj."vwContentTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "AIModelID" = p_AIModelID,
        "MinTags" = p_MinTags,
        "MaxTags" = p_MaxTags
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentPrompt"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentPrompt"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationArtifact"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ConversationID UUID, IN p_ArtifactTypeID UUID, IN p_SharingScope VARCHAR(50), IN p_Comments TEXT)
RETURNS SETOF __mj."vwConversationArtifacts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ConversationArtifact"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ConversationID" = p_ConversationID,
        "ArtifactTypeID" = p_ArtifactTypeID,
        "SharingScope" = p_SharingScope,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversationArtifacts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAICredentialBinding"(IN p_ID UUID, IN p_CredentialID UUID, IN p_BindingType VARCHAR(20), IN p_AIVendorID UUID, IN p_AIModelVendorID UUID, IN p_AIPromptModelID UUID, IN p_Priority INTEGER, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwAICredentialBindings" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AICredentialBinding"
    SET
        "CredentialID" = p_CredentialID,
        "BindingType" = p_BindingType,
        "AIVendorID" = p_AIVendorID,
        "AIModelVendorID" = p_AIModelVendorID,
        "AIPromptModelID" = p_AIPromptModelID,
        "Priority" = p_Priority,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAICredentialBindings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIVendorType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIVendorType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentProcessRun"(IN p_SourceID UUID, IN p_StartTime TIMESTAMPTZ, IN p_EndTime TIMESTAMPTZ, IN p_Status VARCHAR(100), IN p_ProcessedItems INTEGER, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentProcessRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentProcessRun"
            ("ID", "SourceID", "StartTime", "EndTime", "Status", "ProcessedItems")
        VALUES
            (p_ID, p_SourceID, p_StartTime, p_EndTime, p_Status, p_ProcessedItems)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentProcessRun"
            ("SourceID", "StartTime", "EndTime", "Status", "ProcessedItems")
        VALUES
            (p_SourceID, p_StartTime, p_EndTime, p_Status, p_ProcessedItems)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentProcessRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityCommunicationMessageType"(IN p_ID UUID, IN p_EntityID UUID, IN p_BaseMessageTypeID UUID, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwEntityCommunicationMessageTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityCommunicationMessageType"
    SET
        "EntityID" = p_EntityID,
        "BaseMessageTypeID" = p_BaseMessageTypeID,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityCommunicationMessageTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueryEntity"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."QueryEntity"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplicationEntity"(IN p_ID UUID, IN p_ApplicationID UUID, IN p_EntityID UUID, IN p_Sequence INTEGER, IN p_DefaultForNewUser BOOLEAN)
RETURNS SETOF __mj."vwApplicationEntities" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCommunicationLog"(IN p_ID UUID, IN p_CommunicationProviderID UUID, IN p_CommunicationProviderMessageTypeID UUID, IN p_CommunicationRunID UUID, IN p_Direction VARCHAR(20), IN p_MessageDate TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_MessageContent TEXT, IN p_ErrorMessage TEXT)
RETURNS SETOF __mj."vwCommunicationLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CommunicationLog"
    SET
        "CommunicationProviderID" = p_CommunicationProviderID,
        "CommunicationProviderMessageTypeID" = p_CommunicationProviderMessageTypeID,
        "CommunicationRunID" = p_CommunicationRunID,
        "Direction" = p_Direction,
        "MessageDate" = p_MessageDate,
        "Status" = p_Status,
        "MessageContent" = p_MessageContent,
        "ErrorMessage" = p_ErrorMessage
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRunMedia"(IN p_PromptRunID UUID, IN p_ModalityID UUID, IN p_MimeType VARCHAR(100), IN p_FileName VARCHAR(255), IN p_FileSizeBytes INTEGER, IN p_Width INTEGER, IN p_Height INTEGER, IN p_DurationSeconds NUMERIC(10,2), IN p_InlineData TEXT, IN p_FileID UUID, IN p_ThumbnailBase64 TEXT, IN p_Metadata TEXT, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_DisplayOrder INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIPromptRunMedias" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPromptRunMedia"
            ("ID", "PromptRunID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "ThumbnailBase64", "Metadata", "DisplayOrder", "Description")
        VALUES
            (p_ID, p_PromptRunID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, p_ThumbnailBase64, p_Metadata, p_DisplayOrder, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPromptRunMedia"
            ("PromptRunID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "ThumbnailBase64", "Metadata", "DisplayOrder", "Description")
        VALUES
            (p_PromptRunID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, p_ThumbnailBase64, p_Metadata, p_DisplayOrder, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptRunMedias" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateList"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_EntityID UUID, IN p_UserID UUID, IN p_CategoryID UUID, IN p_ExternalSystemRecordID VARCHAR(100), IN p_CompanyIntegrationID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwLists" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."List"
            ("ID", "Name", "Description", "EntityID", "UserID", "CategoryID", "ExternalSystemRecordID", "CompanyIntegrationID")
        VALUES
            (p_ID, p_Name, p_Description, p_EntityID, p_UserID, p_CategoryID, p_ExternalSystemRecordID, p_CompanyIntegrationID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."List"
            ("Name", "Description", "EntityID", "UserID", "CategoryID", "ExternalSystemRecordID", "CompanyIntegrationID")
        VALUES
            (p_Name, p_Description, p_EntityID, p_UserID, p_CategoryID, p_ExternalSystemRecordID, p_CompanyIntegrationID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwLists" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCredentialType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Category VARCHAR(50), IN p_FieldSchema TEXT, IN p_IconClass VARCHAR(100), IN p_ValidationEndpoint VARCHAR(500), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwCredentialTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CredentialType"
            ("ID", "Name", "Description", "Category", "FieldSchema", "IconClass", "ValidationEndpoint")
        VALUES
            (p_ID, p_Name, p_Description, p_Category, p_FieldSchema, p_IconClass, p_ValidationEndpoint)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CredentialType"
            ("Name", "Description", "Category", "FieldSchema", "IconClass", "ValidationEndpoint")
        VALUES
            (p_Name, p_Description, p_Category, p_FieldSchema, p_IconClass, p_ValidationEndpoint)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCredentialTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCollectionPermission"(IN p_ID UUID, IN p_CollectionID UUID, IN p_UserID UUID, IN p_CanRead BOOLEAN, IN p_CanShare BOOLEAN, IN p_CanEdit BOOLEAN, IN p_CanDelete BOOLEAN, IN p_SharedByUserID UUID)
RETURNS SETOF __mj."vwCollectionPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CollectionPermission"
    SET
        "CollectionID" = p_CollectionID,
        "UserID" = p_UserID,
        "CanRead" = p_CanRead,
        "CanShare" = p_CanShare,
        "CanEdit" = p_CanEdit,
        "CanDelete" = p_CanDelete,
        "SharedByUserID" = p_SharedByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCollectionPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserViewCategory"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_EntityID UUID, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwUserViewCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRunMedia"(IN p_ID UUID, IN p_PromptRunID UUID, IN p_ModalityID UUID, IN p_MimeType VARCHAR(100), IN p_FileName VARCHAR(255), IN p_FileSizeBytes INTEGER, IN p_Width INTEGER, IN p_Height INTEGER, IN p_DurationSeconds NUMERIC(10,2), IN p_InlineData TEXT, IN p_FileID UUID, IN p_ThumbnailBase64 TEXT, IN p_Metadata TEXT, IN p_DisplayOrder INTEGER, IN p_Description TEXT)
RETURNS SETOF __mj."vwAIPromptRunMedias" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIPromptRunMedia"
    SET
        "PromptRunID" = p_PromptRunID,
        "ModalityID" = p_ModalityID,
        "MimeType" = p_MimeType,
        "FileName" = p_FileName,
        "FileSizeBytes" = p_FileSizeBytes,
        "Width" = p_Width,
        "Height" = p_Height,
        "DurationSeconds" = p_DurationSeconds,
        "InlineData" = p_InlineData,
        "FileID" = p_FileID,
        "ThumbnailBase64" = p_ThumbnailBase64,
        "Metadata" = p_Metadata,
        "DisplayOrder" = p_DisplayOrder,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptRunMedias" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEncryptionKeySource"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255), IN p_DriverImportPath VARCHAR(500), IN p_ConfigTemplate TEXT, IN p_IsActive BOOLEAN, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwEncryptionKeySources" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EncryptionKeySource"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "DriverImportPath" = p_DriverImportPath,
        "ConfigTemplate" = p_ConfigTemplate,
        "IsActive" = p_IsActive,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEncryptionKeySources" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSource"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentSource"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCommunicationProvider"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Status VARCHAR(20), IN p_SupportsSending BOOLEAN, IN p_SupportsReceiving BOOLEAN, IN p_SupportsScheduledSending BOOLEAN, IN p_SupportsForwarding BOOLEAN, IN p_SupportsReplying BOOLEAN, IN p_SupportsDrafts BOOLEAN)
RETURNS SETOF __mj."vwCommunicationProviders" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CommunicationProvider"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Status" = p_Status,
        "SupportsSending" = p_SupportsSending,
        "SupportsReceiving" = p_SupportsReceiving,
        "SupportsScheduledSending" = p_SupportsScheduledSending,
        "SupportsForwarding" = p_SupportsForwarding,
        "SupportsReplying" = p_SupportsReplying,
        "SupportsDrafts" = p_SupportsDrafts
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationProviders" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionFilter"(IN p_ID UUID, IN p_EntityActionID UUID, IN p_ActionFilterID UUID, IN p_Sequence INTEGER, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwEntityActionFilters" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityActionFilter"
    SET
        "EntityActionID" = p_EntityActionID,
        "ActionFilterID" = p_ActionFilterID,
        "Sequence" = p_Sequence,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionAuthorization"(IN p_ActionID UUID, IN p_AuthorizationID UUID, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwActionAuthorizations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionAuthorization"
            ("ID", "ActionID", "AuthorizationID", "Comments")
        VALUES
            (p_ID, p_ActionID, p_AuthorizationID, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionAuthorization"
            ("ActionID", "AuthorizationID", "Comments")
        VALUES
            (p_ActionID, p_AuthorizationID, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionAuthorizations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateOutputFormatType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_DisplayFormat TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwOutputFormatTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."OutputFormatType"
            ("ID", "Name", "Description", "DisplayFormat")
        VALUES
            (p_ID, p_Name, p_Description, p_DisplayFormat)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."OutputFormatType"
            ("Name", "Description", "DisplayFormat")
        VALUES
            (p_Name, p_Description, p_DisplayFormat)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwOutputFormatTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTemplateParam"(IN p_TemplateID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_DefaultValue TEXT, IN p_LinkedParameterName VARCHAR(255), IN p_LinkedParameterField VARCHAR(500), IN p_ExtraFilter TEXT, IN p_EntityID UUID, IN p_RecordID VARCHAR(2000), IN p_OrderBy TEXT, IN p_TemplateContentID UUID, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(20) DEFAULT NULL, IN p_IsRequired BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwTemplateParams" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TemplateParam"
            ("ID", "TemplateID", "Name", "Description", "Type", "DefaultValue", "IsRequired", "LinkedParameterName", "LinkedParameterField", "ExtraFilter", "EntityID", "RecordID", "OrderBy", "TemplateContentID")
        VALUES
            (p_ID, p_TemplateID, p_Name, p_Description, p_Type, p_DefaultValue, p_IsRequired, p_LinkedParameterName, p_LinkedParameterField, p_ExtraFilter, p_EntityID, p_RecordID, p_OrderBy, p_TemplateContentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TemplateParam"
            ("TemplateID", "Name", "Description", "Type", "DefaultValue", "IsRequired", "LinkedParameterName", "LinkedParameterField", "ExtraFilter", "EntityID", "RecordID", "OrderBy", "TemplateContentID")
        VALUES
            (p_TemplateID, p_Name, p_Description, p_Type, p_DefaultValue, p_IsRequired, p_LinkedParameterName, p_LinkedParameterField, p_ExtraFilter, p_EntityID, p_RecordID, p_OrderBy, p_TemplateContentID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTemplateParams" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIVendorTypeDefinition"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT)
RETURNS SETOF __mj."vwAIVendorTypeDefinitions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIVendorTypeDefinition"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIVendorTypeDefinitions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationSetting"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ApplicationSetting"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentConfiguration"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentConfiguration"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateResourcePermission"(IN p_ID UUID, IN p_ResourceTypeID UUID, IN p_ResourceRecordID VARCHAR(255), IN p_Type VARCHAR(10), IN p_StartSharingAt TIMESTAMPTZ, IN p_EndSharingAt TIMESTAMPTZ, IN p_RoleID UUID, IN p_UserID UUID, IN p_PermissionLevel VARCHAR(20), IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwResourcePermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ResourcePermission"
    SET
        "ResourceTypeID" = p_ResourceTypeID,
        "ResourceRecordID" = p_ResourceRecordID,
        "Type" = p_Type,
        "StartSharingAt" = p_StartSharingAt,
        "EndSharingAt" = p_EndSharingAt,
        "RoleID" = p_RoleID,
        "UserID" = p_UserID,
        "PermissionLevel" = p_PermissionLevel,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwResourcePermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVectorDatabase"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."VectorDatabase"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRunMedia"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIPromptRunMedia"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationRecordMap"(IN p_CompanyIntegrationID UUID, IN p_ExternalSystemRecordID VARCHAR(750), IN p_EntityID UUID, IN p_EntityRecordID VARCHAR(750), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwCompanyIntegrationRecordMaps" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CompanyIntegrationRecordMap"
            ("ID", "CompanyIntegrationID", "ExternalSystemRecordID", "EntityID", "EntityRecordID")
        VALUES
            (p_ID, p_CompanyIntegrationID, p_ExternalSystemRecordID, p_EntityID, p_EntityRecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CompanyIntegrationRecordMap"
            ("CompanyIntegrationID", "ExternalSystemRecordID", "EntityID", "EntityRecordID")
        VALUES
            (p_CompanyIntegrationID, p_ExternalSystemRecordID, p_EntityID, p_EntityRecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRecordMaps" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCredentialType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Category VARCHAR(50), IN p_FieldSchema TEXT, IN p_IconClass VARCHAR(100), IN p_ValidationEndpoint VARCHAR(500))
RETURNS SETOF __mj."vwCredentialTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CredentialType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Category" = p_Category,
        "FieldSchema" = p_FieldSchema,
        "IconClass" = p_IconClass,
        "ValidationEndpoint" = p_ValidationEndpoint
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCredentialTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRelationship"(IN p_AgentID UUID, IN p_SubAgentID UUID, IN p_Status VARCHAR(50), IN p_SubAgentOutputMapping TEXT, IN p_SubAgentInputMapping TEXT, IN p_SubAgentContextPaths TEXT, IN p_MaxMessages INTEGER, IN p_ID UUID DEFAULT NULL, IN p_MessageMode VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentRelationships" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRelationship"
            ("ID", "AgentID", "SubAgentID", "Status", "SubAgentOutputMapping", "SubAgentInputMapping", "SubAgentContextPaths", "MessageMode", "MaxMessages")
        VALUES
            (p_ID, p_AgentID, p_SubAgentID, p_Status, p_SubAgentOutputMapping, p_SubAgentInputMapping, p_SubAgentContextPaths, p_MessageMode, p_MaxMessages)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentRelationship"
            ("AgentID", "SubAgentID", "Status", "SubAgentOutputMapping", "SubAgentInputMapping", "SubAgentContextPaths", "MessageMode", "MaxMessages")
        VALUES
            (p_AgentID, p_SubAgentID, p_Status, p_SubAgentOutputMapping, p_SubAgentInputMapping, p_SubAgentContextPaths, p_MessageMode, p_MaxMessages)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRelationships" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateComponentRegistry"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_URI VARCHAR(500), IN p_Type VARCHAR(50), IN p_APIVersion VARCHAR(50), IN p_Status VARCHAR(50))
RETURNS SETOF __mj."vwComponentRegistries" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ComponentRegistry"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "URI" = p_URI,
        "Type" = p_Type,
        "APIVersion" = p_APIVersion,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwComponentRegistries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailRating"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ConversationDetailRating"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityRelationship"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityRelationship"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentDataSource"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentDataSource"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(IN p_AgentID UUID, IN p_ParentRunID UUID, IN p_CompletedAt TIMESTAMPTZ, IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_ConversationID UUID, IN p_UserID UUID, IN p_Result TEXT, IN p_AgentState TEXT, IN p_TotalTokensUsed INTEGER, IN p_TotalCost NUMERIC(18,6), IN p_TotalPromptTokensUsed INTEGER, IN p_TotalCompletionTokensUsed INTEGER, IN p_TotalTokensUsedRollup INTEGER, IN p_TotalPromptTokensUsedRollup INTEGER, IN p_TotalCompletionTokensUsedRollup INTEGER, IN p_TotalCostRollup NUMERIC(19,8), IN p_ConversationDetailID UUID, IN p_ConversationDetailSequence INTEGER, IN p_CancellationReason VARCHAR(30), IN p_FinalStep VARCHAR(30), IN p_FinalPayload TEXT, IN p_Message TEXT, IN p_LastRunID UUID, IN p_StartingPayload TEXT, IN p_ConfigurationID UUID, IN p_OverrideModelID UUID, IN p_OverrideVendorID UUID, IN p_Data TEXT, IN p_Verbose BOOLEAN, IN p_EffortLevel INTEGER, IN p_RunName VARCHAR(255), IN p_Comments TEXT, IN p_ScheduledJobRunID UUID, IN p_TestRunID UUID, IN p_PrimaryScopeEntityID UUID, IN p_PrimaryScopeRecordID VARCHAR(100), IN p_SecondaryScopes TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL, IN p_TotalPromptIterations INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRun"
            ("ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes")
        VALUES
            (p_ID, p_AgentID, p_ParentRunID, p_Status, p_StartedAt, p_CompletedAt, p_Success, p_ErrorMessage, p_ConversationID, p_UserID, p_Result, p_AgentState, p_TotalTokensUsed, p_TotalCost, p_TotalPromptTokensUsed, p_TotalCompletionTokensUsed, p_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup, p_TotalCostRollup, p_ConversationDetailID, p_ConversationDetailSequence, p_CancellationReason, p_FinalStep, p_FinalPayload, p_Message, p_LastRunID, p_StartingPayload, p_TotalPromptIterations, p_ConfigurationID, p_OverrideModelID, p_OverrideVendorID, p_Data, p_Verbose, p_EffortLevel, p_RunName, p_Comments, p_ScheduledJobRunID, p_TestRunID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentRun"
            ("AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes")
        VALUES
            (p_AgentID, p_ParentRunID, p_Status, p_StartedAt, p_CompletedAt, p_Success, p_ErrorMessage, p_ConversationID, p_UserID, p_Result, p_AgentState, p_TotalTokensUsed, p_TotalCost, p_TotalPromptTokensUsed, p_TotalCompletionTokensUsed, p_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup, p_TotalCostRollup, p_ConversationDetailID, p_ConversationDetailSequence, p_CancellationReason, p_FinalStep, p_FinalPayload, p_Message, p_LastRunID, p_StartingPayload, p_TotalPromptIterations, p_ConfigurationID, p_OverrideModelID, p_OverrideVendorID, p_Data, p_Verbose, p_EffortLevel, p_RunName, p_Comments, p_ScheduledJobRunID, p_TestRunID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueryParameter"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."QueryParameter"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailAttachment"(IN p_ConversationDetailID UUID, IN p_ModalityID UUID, IN p_MimeType VARCHAR(100), IN p_FileName VARCHAR(4000), IN p_FileSizeBytes INTEGER, IN p_Width INTEGER, IN p_Height INTEGER, IN p_DurationSeconds INTEGER, IN p_InlineData TEXT, IN p_FileID UUID, IN p_ThumbnailBase64 TEXT, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_DisplayOrder INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwConversationDetailAttachments" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationDetailAttachment"
            ("ID", "ConversationDetailID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "DisplayOrder", "ThumbnailBase64", "Description")
        VALUES
            (p_ID, p_ConversationDetailID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, p_DisplayOrder, p_ThumbnailBase64, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationDetailAttachment"
            ("ConversationDetailID", "ModalityID", "MimeType", "FileName", "FileSizeBytes", "Width", "Height", "DurationSeconds", "InlineData", "FileID", "DisplayOrder", "ThumbnailBase64", "Description")
        VALUES
            (p_ConversationDetailID, p_ModalityID, p_MimeType, p_FileName, p_FileSizeBytes, p_Width, p_Height, p_DurationSeconds, p_InlineData, p_FileID, p_DisplayOrder, p_ThumbnailBase64, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocumentType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityDocumentTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityDocumentType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityDocumentType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocumentTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserApplication"(IN p_UserID UUID, IN p_ApplicationID UUID, IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwUserApplications" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserApplication"
            ("ID", "UserID", "ApplicationID", "Sequence", "IsActive")
        VALUES
            (p_ID, p_UserID, p_ApplicationID, p_Sequence, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserApplication"
            ("UserID", "ApplicationID", "Sequence", "IsActive")
        VALUES
            (p_UserID, p_ApplicationID, p_Sequence, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserApplications" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateProject"(IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Color VARCHAR(7), IN p_Icon VARCHAR(50), IN p_ID UUID DEFAULT NULL, IN p_EnvironmentID UUID DEFAULT NULL, IN p_IsArchived BOOLEAN DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Project"
            ("ID", "EnvironmentID", "ParentID", "Name", "Description", "Color", "Icon", "IsArchived")
        VALUES
            (p_ID, p_EnvironmentID, p_ParentID, p_Name, p_Description, p_Color, p_Icon, p_IsArchived)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Project" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordChange_Internal"(IN p_EntityName VARCHAR(100), IN p_RecordID VARCHAR(750), IN p_UserID UUID, IN p_Type VARCHAR(20), IN p_ChangesJSON TEXT, IN p_ChangesDescription TEXT, IN p_FullRecordJSON TEXT, IN p_Status CHAR(15), IN p_Comments TEXT)
RETURNS SETOF __mj."vwRecordChanges" AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO __mj."RecordChange"
        ("EntityName", "RecordID", "UserID", "Type", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status", "Comments")
    VALUES
        (p_EntityName, p_RecordID, p_UserID, p_Type, p_ChangesJSON, p_ChangesDescription, p_FullRecordJSON, p_Status, p_Comments)
    RETURNING "ID" INTO v_id;
    RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(IN p_ID UUID, IN p_AgentID UUID, IN p_ParentRunID UUID, IN p_Status VARCHAR(50), IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_ConversationID UUID, IN p_UserID UUID, IN p_Result TEXT, IN p_AgentState TEXT, IN p_TotalTokensUsed INTEGER, IN p_TotalCost NUMERIC(18,6), IN p_TotalPromptTokensUsed INTEGER, IN p_TotalCompletionTokensUsed INTEGER, IN p_TotalTokensUsedRollup INTEGER, IN p_TotalPromptTokensUsedRollup INTEGER, IN p_TotalCompletionTokensUsedRollup INTEGER, IN p_TotalCostRollup NUMERIC(19,8), IN p_ConversationDetailID UUID, IN p_ConversationDetailSequence INTEGER, IN p_CancellationReason VARCHAR(30), IN p_FinalStep VARCHAR(30), IN p_FinalPayload TEXT, IN p_Message TEXT, IN p_LastRunID UUID, IN p_StartingPayload TEXT, IN p_TotalPromptIterations INTEGER, IN p_ConfigurationID UUID, IN p_OverrideModelID UUID, IN p_OverrideVendorID UUID, IN p_Data TEXT, IN p_Verbose BOOLEAN, IN p_EffortLevel INTEGER, IN p_RunName VARCHAR(255), IN p_Comments TEXT, IN p_ScheduledJobRunID UUID, IN p_TestRunID UUID, IN p_PrimaryScopeEntityID UUID, IN p_PrimaryScopeRecordID VARCHAR(100), IN p_SecondaryScopes TEXT)
RETURNS SETOF __mj."vwAIAgentRuns" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionFilter"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityActionFilter"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailAttachment"(IN p_ID UUID, IN p_ConversationDetailID UUID, IN p_ModalityID UUID, IN p_MimeType VARCHAR(100), IN p_FileName VARCHAR(4000), IN p_FileSizeBytes INTEGER, IN p_Width INTEGER, IN p_Height INTEGER, IN p_DurationSeconds INTEGER, IN p_InlineData TEXT, IN p_FileID UUID, IN p_DisplayOrder INTEGER, IN p_ThumbnailBase64 TEXT, IN p_Description TEXT)
RETURNS SETOF __mj."vwConversationDetailAttachments" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteReportCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ReportCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunStep"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentRunStep"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAICredentialBinding"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AICredentialBinding"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentSourceTypeParam"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Type VARCHAR(50), IN p_DefaultValue TEXT, IN p_IsRequired BOOLEAN, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentSourceTypeParams" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentSourceTypeParam"
            ("ID", "Name", "Description", "Type", "DefaultValue", "IsRequired")
        VALUES
            (p_ID, p_Name, p_Description, p_Type, p_DefaultValue, p_IsRequired)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentSourceTypeParam"
            ("Name", "Description", "Type", "DefaultValue", "IsRequired")
        VALUES
            (p_Name, p_Description, p_Type, p_DefaultValue, p_IsRequired)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentSourceTypeParams" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationRecordMap"(IN p_ID UUID, IN p_CompanyIntegrationID UUID, IN p_ExternalSystemRecordID VARCHAR(750), IN p_EntityID UUID, IN p_EntityRecordID VARCHAR(750))
RETURNS SETOF __mj."vwCompanyIntegrationRecordMaps" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CompanyIntegrationRecordMap"
    SET
        "CompanyIntegrationID" = p_CompanyIntegrationID,
        "ExternalSystemRecordID" = p_ExternalSystemRecordID,
        "EntityID" = p_EntityID,
        "EntityRecordID" = p_EntityRecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRecordMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateReportVersion"(IN p_ReportID UUID, IN p_VersionNumber INTEGER, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Configuration TEXT, IN p_ID UUID DEFAULT NULL, IN p_DataContextUpdated BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwReportVersions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ReportVersion"
            ("ID", "ReportID", "VersionNumber", "Name", "Description", "Configuration", "DataContextUpdated")
        VALUES
            (p_ID, p_ReportID, p_VersionNumber, p_Name, p_Description, p_Configuration, p_DataContextUpdated)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ReportVersion"
            ("ReportID", "VersionNumber", "Name", "Description", "Configuration", "DataContextUpdated")
        VALUES
            (p_ReportID, p_VersionNumber, p_Name, p_Description, p_Configuration, p_DataContextUpdated)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwReportVersions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegration"(IN p_Name VARCHAR(100), IN p_Description VARCHAR(255), IN p_NavigationBaseURL VARCHAR(500), IN p_ClassName VARCHAR(100), IN p_ImportPath VARCHAR(100), IN p_BatchMaxRequestCount INTEGER, IN p_BatchRequestWaitTime INTEGER, IN p_ID UUID)
RETURNS SETOF __mj."vwIntegrations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Integration"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "NavigationBaseURL" = p_NavigationBaseURL,
        "ClassName" = p_ClassName,
        "ImportPath" = p_ImportPath,
        "BatchMaxRequestCount" = p_BatchMaxRequestCount,
        "BatchRequestWaitTime" = p_BatchRequestWaitTime
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwIntegrations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentItem"(IN p_ContentSourceID UUID, IN p_Name VARCHAR(250), IN p_Description TEXT, IN p_ContentTypeID UUID, IN p_ContentSourceTypeID UUID, IN p_ContentFileTypeID UUID, IN p_Checksum VARCHAR(100), IN p_URL VARCHAR(2000), IN p_Text TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentItem"
            ("ID", "ContentSourceID", "Name", "Description", "ContentTypeID", "ContentSourceTypeID", "ContentFileTypeID", "Checksum", "URL", "Text")
        VALUES
            (p_ID, p_ContentSourceID, p_Name, p_Description, p_ContentTypeID, p_ContentSourceTypeID, p_ContentFileTypeID, p_Checksum, p_URL, p_Text)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentItem"
            ("ContentSourceID", "Name", "Description", "ContentTypeID", "ContentSourceTypeID", "ContentFileTypeID", "Checksum", "URL", "Text")
        VALUES
            (p_ContentSourceID, p_Name, p_Description, p_ContentTypeID, p_ContentSourceTypeID, p_ContentFileTypeID, p_Checksum, p_URL, p_Text)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateApplicationSetting"(IN p_ApplicationID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwApplicationSettings" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ApplicationSetting"
            ("ID", "ApplicationID", "Name", "Value", "Comments")
        VALUES
            (p_ID, p_ApplicationID, p_Name, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ApplicationSetting"
            ("ApplicationID", "Name", "Value", "Comments")
        VALUES
            (p_ApplicationID, p_Name, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwApplicationSettings" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionAuthorization"(IN p_ID UUID, IN p_ActionID UUID, IN p_AuthorizationID UUID, IN p_Comments TEXT)
RETURNS SETOF __mj."vwActionAuthorizations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionAuthorization"
    SET
        "ActionID" = p_ActionID,
        "AuthorizationID" = p_AuthorizationID,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionAuthorizations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailAttachment"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ConversationDetailAttachment"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateContentType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TemplateContentType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordMergeLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecordMergeLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRelationship"(IN p_ID UUID, IN p_AgentID UUID, IN p_SubAgentID UUID, IN p_Status VARCHAR(50), IN p_SubAgentOutputMapping TEXT, IN p_SubAgentInputMapping TEXT, IN p_SubAgentContextPaths TEXT, IN p_MessageMode VARCHAR(50), IN p_MaxMessages INTEGER)
RETURNS SETOF __mj."vwAIAgentRelationships" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentRelationship"
    SET
        "AgentID" = p_AgentID,
        "SubAgentID" = p_SubAgentID,
        "Status" = p_Status,
        "SubAgentOutputMapping" = p_SubAgentOutputMapping,
        "SubAgentInputMapping" = p_SubAgentInputMapping,
        "SubAgentContextPaths" = p_SubAgentContextPaths,
        "MessageMode" = p_MessageMode,
        "MaxMessages" = p_MaxMessages
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRelationships" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocumentRun"(IN p_EntityDocumentID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(15) DEFAULT NULL)
RETURNS SETOF __mj."vwEntityDocumentRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityDocumentRun"
            ("ID", "EntityDocumentID", "StartedAt", "EndedAt", "Status")
        VALUES
            (p_ID, p_EntityDocumentID, p_StartedAt, p_EndedAt, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityDocumentRun"
            ("EntityDocumentID", "StartedAt", "EndedAt", "Status")
        VALUES
            (p_EntityDocumentID, p_StartedAt, p_EndedAt, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocumentRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentAction"(IN p_ID UUID, IN p_AgentID UUID, IN p_ActionID UUID, IN p_Status VARCHAR(15), IN p_MinExecutionsPerRun INTEGER, IN p_MaxExecutionsPerRun INTEGER, IN p_ResultExpirationTurns INTEGER, IN p_ResultExpirationMode VARCHAR(20), IN p_CompactMode VARCHAR(20), IN p_CompactLength INTEGER, IN p_CompactPromptID UUID)
RETURNS SETOF __mj."vwAIAgentActions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentAction"
    SET
        "AgentID" = p_AgentID,
        "ActionID" = p_ActionID,
        "Status" = p_Status,
        "MinExecutionsPerRun" = p_MinExecutionsPerRun,
        "MaxExecutionsPerRun" = p_MaxExecutionsPerRun,
        "ResultExpirationTurns" = p_ResultExpirationTurns,
        "ResultExpirationMode" = p_ResultExpirationMode,
        "CompactMode" = p_CompactMode,
        "CompactLength" = p_CompactLength,
        "CompactPromptID" = p_CompactPromptID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentActions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentProcessRun"(IN p_ID UUID, IN p_SourceID UUID, IN p_StartTime TIMESTAMPTZ, IN p_EndTime TIMESTAMPTZ, IN p_Status VARCHAR(100), IN p_ProcessedItems INTEGER)
RETURNS SETOF __mj."vwContentProcessRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentProcessRun"
    SET
        "SourceID" = p_SourceID,
        "StartTime" = p_StartTime,
        "EndTime" = p_EndTime,
        "Status" = p_Status,
        "ProcessedItems" = p_ProcessedItems
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentProcessRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationProvider"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CommunicationProvider"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationRunDetail"(IN p_CompanyIntegrationRunID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_Action CHAR(20), IN p_ID UUID DEFAULT NULL, IN p_ExecutedAt TIMESTAMPTZ DEFAULT NULL, IN p_IsSuccess BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwCompanyIntegrationRunDetails" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CompanyIntegrationRunDetail"
            ("ID", "CompanyIntegrationRunID", "EntityID", "RecordID", "Action", "ExecutedAt", "IsSuccess")
        VALUES
            (p_ID, p_CompanyIntegrationRunID, p_EntityID, p_RecordID, p_Action, p_ExecutedAt, p_IsSuccess)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CompanyIntegrationRunDetail"
            ("CompanyIntegrationRunID", "EntityID", "RecordID", "Action", "ExecutedAt", "IsSuccess")
        VALUES
            (p_CompanyIntegrationRunID, p_EntityID, p_RecordID, p_Action, p_ExecutedAt, p_IsSuccess)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRunDetails" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordLink"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecordLink"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserViewCategory"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_EntityID UUID, IN p_UserID UUID)
RETURNS SETOF __mj."vwUserViewCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateList"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_EntityID UUID, IN p_UserID UUID, IN p_CategoryID UUID, IN p_ExternalSystemRecordID VARCHAR(100), IN p_CompanyIntegrationID UUID)
RETURNS SETOF __mj."vwLists" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."List"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "EntityID" = p_EntityID,
        "UserID" = p_UserID,
        "CategoryID" = p_CategoryID,
        "ExternalSystemRecordID" = p_ExternalSystemRecordID,
        "CompanyIntegrationID" = p_CompanyIntegrationID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwLists" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionExecutionLog"(IN p_ID UUID, IN p_ActionID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Params TEXT, IN p_ResultCode VARCHAR(255), IN p_UserID UUID, IN p_RetentionPeriod INTEGER, IN p_Message TEXT)
RETURNS SETOF __mj."vwActionExecutionLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionExecutionLog"
    SET
        "ActionID" = p_ActionID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Params" = p_Params,
        "ResultCode" = p_ResultCode,
        "UserID" = p_UserID,
        "RetentionPeriod" = p_RetentionPeriod,
        "Message" = p_Message
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionExecutionLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionInvocationType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_DisplaySequence INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwEntityActionInvocationTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityActionInvocationType"
            ("ID", "Name", "Description", "DisplaySequence")
        VALUES
            (p_ID, p_Name, p_Description, p_DisplaySequence)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityActionInvocationType"
            ("Name", "Description", "DisplaySequence")
        VALUES
            (p_Name, p_Description, p_DisplaySequence)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocationTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateExplorerNavigationItem"(IN p_Sequence INTEGER, IN p_Name VARCHAR(100), IN p_Route VARCHAR(255), IN p_IconCSSClass VARCHAR(100), IN p_Description TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_ShowInHomeScreen BOOLEAN DEFAULT NULL, IN p_ShowInNavigationDrawer BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwExplorerNavigationItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ExplorerNavigationItem"
            ("ID", "Sequence", "Name", "Route", "IsActive", "ShowInHomeScreen", "ShowInNavigationDrawer", "IconCSSClass", "Description", "Comments")
        VALUES
            (p_ID, p_Sequence, p_Name, p_Route, p_IsActive, p_ShowInHomeScreen, p_ShowInNavigationDrawer, p_IconCSSClass, p_Description, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ExplorerNavigationItem"
            ("Sequence", "Name", "Route", "IsActive", "ShowInHomeScreen", "ShowInNavigationDrawer", "IconCSSClass", "Description", "Comments")
        VALUES
            (p_Sequence, p_Name, p_Route, p_IsActive, p_ShowInHomeScreen, p_ShowInNavigationDrawer, p_IconCSSClass, p_Description, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwExplorerNavigationItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOutputFormatType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_DisplayFormat TEXT)
RETURNS SETOF __mj."vwOutputFormatTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."OutputFormatType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DisplayFormat" = p_DisplayFormat
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwOutputFormatTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteWorkspace"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Workspace"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTemplateParam"(IN p_ID UUID, IN p_TemplateID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Type VARCHAR(20), IN p_DefaultValue TEXT, IN p_IsRequired BOOLEAN, IN p_LinkedParameterName VARCHAR(255), IN p_LinkedParameterField VARCHAR(500), IN p_ExtraFilter TEXT, IN p_EntityID UUID, IN p_RecordID VARCHAR(2000), IN p_OrderBy TEXT, IN p_TemplateContentID UUID)
RETURNS SETOF __mj."vwTemplateParams" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TemplateParam"
    SET
        "TemplateID" = p_TemplateID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Type" = p_Type,
        "DefaultValue" = p_DefaultValue,
        "IsRequired" = p_IsRequired,
        "LinkedParameterName" = p_LinkedParameterName,
        "LinkedParameterField" = p_LinkedParameterField,
        "ExtraFilter" = p_ExtraFilter,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "OrderBy" = p_OrderBy,
        "TemplateContentID" = p_TemplateContentID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTemplateParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIVendorType"(IN p_VendorID UUID, IN p_TypeID UUID, IN p_ID UUID DEFAULT NULL, IN p_Rank INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIVendorTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIVendorType"
            ("ID", "VendorID", "TypeID", "Rank", "Status")
        VALUES
            (p_ID, p_VendorID, p_TypeID, p_Rank, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIVendorType"
            ("VendorID", "TypeID", "Rank", "Status")
        VALUES
            (p_VendorID, p_TypeID, p_Rank, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIVendorTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueryField"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."QueryField"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVectorIndex"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."VectorIndex"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateReport"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CategoryID UUID, IN p_UserID UUID, IN p_ConversationID UUID, IN p_ConversationDetailID UUID, IN p_DataContextID UUID, IN p_Configuration TEXT, IN p_OutputTriggerTypeID UUID, IN p_OutputFormatTypeID UUID, IN p_OutputDeliveryTypeID UUID, IN p_OutputFrequency VARCHAR(50), IN p_OutputTargetEmail VARCHAR(255), IN p_OutputWorkflowID UUID, IN p_Thumbnail TEXT, IN p_ID UUID DEFAULT NULL, IN p_SharingScope VARCHAR(20) DEFAULT NULL, IN p_EnvironmentID UUID DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Report"
            ("ID", "Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID")
        VALUES
            (p_ID, p_Name, p_Description, p_CategoryID, p_UserID, p_SharingScope, p_ConversationID, p_ConversationDetailID, p_DataContextID, p_Configuration, p_OutputTriggerTypeID, p_OutputFormatTypeID, p_OutputDeliveryTypeID, p_OutputFrequency, p_OutputTargetEmail, p_OutputWorkflowID, p_Thumbnail, p_EnvironmentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Report" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentStep"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentStep"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCredentialType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CredentialType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplicationSetting"(IN p_ID UUID, IN p_ApplicationID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwApplicationSettings" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ApplicationSetting"
    SET
        "ApplicationID" = p_ApplicationID,
        "Name" = p_Name,
        "Value" = p_Value,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwApplicationSettings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSourceTypeParam"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Type VARCHAR(50), IN p_DefaultValue TEXT, IN p_IsRequired BOOLEAN)
RETURNS SETOF __mj."vwContentSourceTypeParams" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentSourceTypeParam"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Type" = p_Type,
        "DefaultValue" = p_DefaultValue,
        "IsRequired" = p_IsRequired
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentSourceTypeParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocumentType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT)
RETURNS SETOF __mj."vwEntityDocumentTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityDocumentType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocumentTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDataContext"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_UserID UUID, IN p_LastRefreshedAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwDataContexts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DataContext"
            ("ID", "Name", "Description", "UserID", "LastRefreshedAt")
        VALUES
            (p_ID, p_Name, p_Description, p_UserID, p_LastRefreshedAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DataContext"
            ("Name", "Description", "UserID", "LastRefreshedAt")
        VALUES
            (p_Name, p_Description, p_UserID, p_LastRefreshedAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDataContexts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateProject"(IN p_ID UUID, IN p_EnvironmentID UUID, IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Color VARCHAR(7), IN p_Icon VARCHAR(50), IN p_IsArchived BOOLEAN)
RETURNS SETOF __mj."vwProjects" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateSchemaInfo"(IN p_SchemaName VARCHAR(50), IN p_EntityIDMin INTEGER, IN p_EntityIDMax INTEGER, IN p_Comments TEXT, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwSchemaInfos" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."SchemaInfo"
            ("ID", "SchemaName", "EntityIDMin", "EntityIDMax", "Comments", "Description")
        VALUES
            (p_ID, p_SchemaName, p_EntityIDMin, p_EntityIDMax, p_Comments, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."SchemaInfo"
            ("SchemaName", "EntityIDMin", "EntityIDMax", "Comments", "Description")
        VALUES
            (p_SchemaName, p_EntityIDMin, p_EntityIDMax, p_Comments, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwSchemaInfos" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateFile"(IN p_Name VARCHAR(500), IN p_Description TEXT, IN p_CategoryID UUID, IN p_ProviderID UUID, IN p_ContentType VARCHAR(255), IN p_ProviderKey VARCHAR(500), IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwFiles" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."File"
            ("ID", "Name", "Description", "CategoryID", "ProviderID", "ContentType", "ProviderKey", "Status")
        VALUES
            (p_ID, p_Name, p_Description, p_CategoryID, p_ProviderID, p_ContentType, p_ProviderKey, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."File"
            ("Name", "Description", "CategoryID", "ProviderID", "ContentType", "ProviderKey", "Status")
        VALUES
            (p_Name, p_Description, p_CategoryID, p_ProviderID, p_ContentType, p_ProviderKey, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwFiles" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelCost"(IN p_ModelID UUID, IN p_VendorID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_Currency CHAR(3), IN p_PriceTypeID UUID, IN p_InputPricePerUnit NUMERIC(18,8), IN p_OutputPricePerUnit NUMERIC(18,8), IN p_UnitTypeID UUID, IN p_ProcessingType VARCHAR(20), IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelCosts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelCost"
            ("ID", "ModelID", "VendorID", "StartedAt", "EndedAt", "Status", "Currency", "PriceTypeID", "InputPricePerUnit", "OutputPricePerUnit", "UnitTypeID", "ProcessingType", "Comments")
        VALUES
            (p_ID, p_ModelID, p_VendorID, p_StartedAt, p_EndedAt, p_Status, p_Currency, p_PriceTypeID, p_InputPricePerUnit, p_OutputPricePerUnit, p_UnitTypeID, p_ProcessingType, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelCost"
            ("ModelID", "VendorID", "StartedAt", "EndedAt", "Status", "Currency", "PriceTypeID", "InputPricePerUnit", "OutputPricePerUnit", "UnitTypeID", "ProcessingType", "Comments")
        VALUES
            (p_ModelID, p_VendorID, p_StartedAt, p_EndedAt, p_Status, p_Currency, p_PriceTypeID, p_InputPricePerUnit, p_OutputPricePerUnit, p_UnitTypeID, p_ProcessingType, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelCosts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CommunicationLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserSetting"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserSetting"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserApplication"(IN p_ID UUID, IN p_UserID UUID, IN p_ApplicationID UUID, IN p_Sequence INTEGER, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwUserApplications" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserApplication"
    SET
        "UserID" = p_UserID,
        "ApplicationID" = p_ApplicationID,
        "Sequence" = p_Sequence,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserApplications" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboardPartType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Icon VARCHAR(100), IN p_DriverClass VARCHAR(255), IN p_ConfigDialogClass VARCHAR(255), IN p_DefaultConfig TEXT, IN p_ID UUID DEFAULT NULL, IN p_SortOrder INTEGER DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwDashboardPartTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DashboardPartType"
            ("ID", "Name", "Description", "Icon", "DriverClass", "ConfigDialogClass", "DefaultConfig", "SortOrder", "IsActive")
        VALUES
            (p_ID, p_Name, p_Description, p_Icon, p_DriverClass, p_ConfigDialogClass, p_DefaultConfig, p_SortOrder, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DashboardPartType"
            ("Name", "Description", "Icon", "DriverClass", "ConfigDialogClass", "DefaultConfig", "SortOrder", "IsActive")
        VALUES
            (p_Name, p_Description, p_Icon, p_DriverClass, p_ConfigDialogClass, p_DefaultConfig, p_SortOrder, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboardPartTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteReportSnapshot"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ReportSnapshot"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordChange"(IN p_EntityID UUID, IN p_RecordID VARCHAR(750), IN p_UserID UUID, IN p_ChangesJSON TEXT, IN p_ChangesDescription TEXT, IN p_FullRecordJSON TEXT, IN p_ErrorLog TEXT, IN p_ReplayRunID UUID, IN p_IntegrationID UUID, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(20) DEFAULT NULL, IN p_Source VARCHAR(20) DEFAULT NULL, IN p_ChangedAt TIMESTAMPTZ DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwRecordChanges" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecordChange"
            ("ID", "EntityID", "RecordID", "UserID", "Type", "Source", "ChangedAt", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status", "ErrorLog", "ReplayRunID", "IntegrationID", "Comments")
        VALUES
            (p_ID, p_EntityID, p_RecordID, p_UserID, p_Type, p_Source, p_ChangedAt, p_ChangesJSON, p_ChangesDescription, p_FullRecordJSON, p_Status, p_ErrorLog, p_ReplayRunID, p_IntegrationID, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecordChange"
            ("EntityID", "RecordID", "UserID", "Type", "Source", "ChangedAt", "ChangesJSON", "ChangesDescription", "FullRecordJSON", "Status", "ErrorLog", "ReplayRunID", "IntegrationID", "Comments")
        VALUES
            (p_EntityID, p_RecordID, p_UserID, p_Type, p_Source, p_ChangedAt, p_ChangesJSON, p_ChangesDescription, p_FullRecordJSON, p_Status, p_ErrorLog, p_ReplayRunID, p_IntegrationID, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecommendationRun"(IN p_RecommendationProviderID UUID, IN p_StartDate TIMESTAMPTZ, IN p_EndDate TIMESTAMPTZ, IN p_Status VARCHAR(50), IN p_Description TEXT, IN p_RunByUserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRecommendationRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecommendationRun"
            ("ID", "RecommendationProviderID", "StartDate", "EndDate", "Status", "Description", "RunByUserID")
        VALUES
            (p_ID, p_RecommendationProviderID, p_StartDate, p_EndDate, p_Status, p_Description, p_RunByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecommendationRun"
            ("RecommendationProviderID", "StartDate", "EndDate", "Status", "Description", "RunByUserID")
        VALUES
            (p_RecommendationProviderID, p_StartDate, p_EndDate, p_Status, p_Description, p_RunByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecommendationRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityRelationshipDisplayComponent"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityRelationshipDisplayComponent"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionInvocationType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityActionInvocationType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEncryptionKeySource"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EncryptionKeySource"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardPartType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Icon VARCHAR(100), IN p_DriverClass VARCHAR(255), IN p_ConfigDialogClass VARCHAR(255), IN p_DefaultConfig TEXT, IN p_SortOrder INTEGER, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwDashboardPartTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DashboardPartType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Icon" = p_Icon,
        "DriverClass" = p_DriverClass,
        "ConfigDialogClass" = p_ConfigDialogClass,
        "DefaultConfig" = p_DefaultConfig,
        "SortOrder" = p_SortOrder,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboardPartTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIVendorType"(IN p_ID UUID, IN p_VendorID UUID, IN p_TypeID UUID, IN p_Rank INTEGER, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwAIVendorTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIVendorType"
    SET
        "VendorID" = p_VendorID,
        "TypeID" = p_TypeID,
        "Rank" = p_Rank,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIVendorTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItem"(IN p_ID UUID, IN p_ContentSourceID UUID, IN p_Name VARCHAR(250), IN p_Description TEXT, IN p_ContentTypeID UUID, IN p_ContentSourceTypeID UUID, IN p_ContentFileTypeID UUID, IN p_Checksum VARCHAR(100), IN p_URL VARCHAR(2000), IN p_Text TEXT)
RETURNS SETOF __mj."vwContentItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentItem"
    SET
        "ContentSourceID" = p_ContentSourceID,
        "Name" = p_Name,
        "Description" = p_Description,
        "ContentTypeID" = p_ContentTypeID,
        "ContentSourceTypeID" = p_ContentSourceTypeID,
        "ContentFileTypeID" = p_ContentFileTypeID,
        "Checksum" = p_Checksum,
        "URL" = p_URL,
        "Text" = p_Text
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionInvocationType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_DisplaySequence INTEGER)
RETURNS SETOF __mj."vwEntityActionInvocationTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityActionInvocationType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DisplaySequence" = p_DisplaySequence
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocationTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateScheduledAction"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CreatedByUserID UUID, IN p_ActionID UUID, IN p_Type VARCHAR(20), IN p_CronExpression VARCHAR(100), IN p_Timezone VARCHAR(100), IN p_IntervalDays INTEGER, IN p_DayOfWeek VARCHAR(20), IN p_DayOfMonth INTEGER, IN p_Month VARCHAR(20), IN p_CustomCronExpression VARCHAR(255), IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwScheduledActions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ScheduledAction"
            ("ID", "Name", "Description", "CreatedByUserID", "ActionID", "Type", "CronExpression", "Timezone", "Status", "IntervalDays", "DayOfWeek", "DayOfMonth", "Month", "CustomCronExpression")
        VALUES
            (p_ID, p_Name, p_Description, p_CreatedByUserID, p_ActionID, p_Type, p_CronExpression, p_Timezone, p_Status, p_IntervalDays, p_DayOfWeek, p_DayOfMonth, p_Month, p_CustomCronExpression)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ScheduledAction"
            ("Name", "Description", "CreatedByUserID", "ActionID", "Type", "CronExpression", "Timezone", "Status", "IntervalDays", "DayOfWeek", "DayOfMonth", "Month", "CustomCronExpression")
        VALUES
            (p_Name, p_Description, p_CreatedByUserID, p_ActionID, p_Type, p_CronExpression, p_Timezone, p_Status, p_IntervalDays, p_DayOfWeek, p_DayOfMonth, p_Month, p_CustomCronExpression)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwScheduledActions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateReport"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CategoryID UUID, IN p_UserID UUID, IN p_SharingScope VARCHAR(20), IN p_ConversationID UUID, IN p_ConversationDetailID UUID, IN p_DataContextID UUID, IN p_Configuration TEXT, IN p_OutputTriggerTypeID UUID, IN p_OutputFormatTypeID UUID, IN p_OutputDeliveryTypeID UUID, IN p_OutputFrequency VARCHAR(50), IN p_OutputTargetEmail VARCHAR(255), IN p_OutputWorkflowID UUID, IN p_Thumbnail TEXT, IN p_EnvironmentID UUID)
RETURNS SETOF __mj."vwReports" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Report"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "CategoryID" = p_CategoryID,
        "UserID" = p_UserID,
        "SharingScope" = p_SharingScope,
        "ConversationID" = p_ConversationID,
        "ConversationDetailID" = p_ConversationDetailID,
        "DataContextID" = p_DataContextID,
        "Configuration" = p_Configuration,
        "OutputTriggerTypeID" = p_OutputTriggerTypeID,
        "OutputFormatTypeID" = p_OutputFormatTypeID,
        "OutputDeliveryTypeID" = p_OutputDeliveryTypeID,
        "OutputFrequency" = p_OutputFrequency,
        "OutputTargetEmail" = p_OutputTargetEmail,
        "OutputWorkflowID" = p_OutputWorkflowID,
        "Thumbnail" = p_Thumbnail,
        "EnvironmentID" = p_EnvironmentID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwReports" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateReportVersion"(IN p_ID UUID, IN p_ReportID UUID, IN p_VersionNumber INTEGER, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Configuration TEXT, IN p_DataContextUpdated BOOLEAN)
RETURNS SETOF __mj."vwReportVersions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ReportVersion"
    SET
        "ReportID" = p_ReportID,
        "VersionNumber" = p_VersionNumber,
        "Name" = p_Name,
        "Description" = p_Description,
        "Configuration" = p_Configuration,
        "DataContextUpdated" = p_DataContextUpdated
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwReportVersions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserView"(IN p_UserID UUID, IN p_EntityID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_CategoryID UUID, IN p_GridState TEXT, IN p_FilterState TEXT, IN p_SmartFilterPrompt TEXT, IN p_SmartFilterWhereClause TEXT, IN p_SmartFilterExplanation TEXT, IN p_WhereClause TEXT, IN p_SortState TEXT, IN p_Thumbnail TEXT, IN p_CardState TEXT, IN p_DisplayState TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsShared BOOLEAN DEFAULT NULL, IN p_IsDefault BOOLEAN DEFAULT NULL, IN p_CustomFilterState BOOLEAN DEFAULT NULL, IN p_SmartFilterEnabled BOOLEAN DEFAULT NULL, IN p_CustomWhereClause BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwUserViews" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserView"
            ("ID", "UserID", "EntityID", "Name", "Description", "CategoryID", "IsShared", "IsDefault", "GridState", "FilterState", "CustomFilterState", "SmartFilterEnabled", "SmartFilterPrompt", "SmartFilterWhereClause", "SmartFilterExplanation", "WhereClause", "CustomWhereClause", "SortState", "Thumbnail", "CardState", "DisplayState")
        VALUES
            (p_ID, p_UserID, p_EntityID, p_Name, p_Description, p_CategoryID, p_IsShared, p_IsDefault, p_GridState, p_FilterState, p_CustomFilterState, p_SmartFilterEnabled, p_SmartFilterPrompt, p_SmartFilterWhereClause, p_SmartFilterExplanation, p_WhereClause, p_CustomWhereClause, p_SortState, p_Thumbnail, p_CardState, p_DisplayState)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserView"
            ("UserID", "EntityID", "Name", "Description", "CategoryID", "IsShared", "IsDefault", "GridState", "FilterState", "CustomFilterState", "SmartFilterEnabled", "SmartFilterPrompt", "SmartFilterWhereClause", "SmartFilterExplanation", "WhereClause", "CustomWhereClause", "SortState", "Thumbnail", "CardState", "DisplayState")
        VALUES
            (p_UserID, p_EntityID, p_Name, p_Description, p_CategoryID, p_IsShared, p_IsDefault, p_GridState, p_FilterState, p_CustomFilterState, p_SmartFilterEnabled, p_SmartFilterPrompt, p_SmartFilterWhereClause, p_SmartFilterExplanation, p_WhereClause, p_CustomWhereClause, p_SortState, p_Thumbnail, p_CardState, p_DisplayState)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserViews" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJobRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ScheduledJobRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateListInvitation"(IN p_ListID UUID, IN p_Email VARCHAR(255), IN p_Role VARCHAR(50), IN p_Token VARCHAR(100), IN p_ExpiresAt TIMESTAMP, IN p_CreatedByUserID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwListInvitations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ListInvitation"
            ("ID", "ListID", "Email", "Role", "Token", "ExpiresAt", "CreatedByUserID", "Status")
        VALUES
            (p_ID, p_ListID, p_Email, p_Role, p_Token, p_ExpiresAt, p_CreatedByUserID, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ListInvitation"
            ("ListID", "Email", "Role", "Token", "ExpiresAt", "CreatedByUserID", "Status")
        VALUES
            (p_ListID, p_Email, p_Role, p_Token, p_ExpiresAt, p_CreatedByUserID, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwListInvitations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactVersion"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ArtifactVersion"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateContent"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TemplateContent"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardPartType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DashboardPartType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentSource"(IN p_Name VARCHAR(255), IN p_ContentTypeID UUID, IN p_ContentSourceTypeID UUID, IN p_ContentFileTypeID UUID, IN p_URL VARCHAR(2000), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentSources" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentSource"
            ("ID", "Name", "ContentTypeID", "ContentSourceTypeID", "ContentFileTypeID", "URL")
        VALUES
            (p_ID, p_Name, p_ContentTypeID, p_ContentSourceTypeID, p_ContentFileTypeID, p_URL)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentSource"
            ("Name", "ContentTypeID", "ContentSourceTypeID", "ContentFileTypeID", "URL")
        VALUES
            (p_Name, p_ContentTypeID, p_ContentSourceTypeID, p_ContentFileTypeID, p_URL)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentStepPath"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentStepPath"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationRunDetail"(IN p_ID UUID, IN p_CompanyIntegrationRunID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_Action CHAR(20), IN p_ExecutedAt TIMESTAMPTZ, IN p_IsSuccess BOOLEAN)
RETURNS SETOF __mj."vwCompanyIntegrationRunDetails" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CompanyIntegrationRunDetail"
    SET
        "CompanyIntegrationRunID" = p_CompanyIntegrationRunID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "Action" = p_Action,
        "ExecutedAt" = p_ExecutedAt,
        "IsSuccess" = p_IsSuccess
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRelationship"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentRelationship"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNote"(IN p_AgentID UUID, IN p_AgentNoteTypeID UUID, IN p_Note TEXT, IN p_UserID UUID, IN p_Comments TEXT, IN p_SourceConversationID UUID, IN p_SourceConversationDetailID UUID, IN p_SourceAIAgentRunID UUID, IN p_CompanyID UUID, IN p_EmbeddingVector TEXT, IN p_EmbeddingModelID UUID, IN p_PrimaryScopeEntityID UUID, IN p_PrimaryScopeRecordID VARCHAR(100), IN p_SecondaryScopes TEXT, IN p_LastAccessedAt TIMESTAMPTZ, IN p_ExpiresAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(20) DEFAULT NULL, IN p_IsAutoGenerated BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_AccessCount INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentNotes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentNote"
            ("ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_ID, p_AgentID, p_AgentNoteTypeID, p_Note, p_UserID, p_Type, p_IsAutoGenerated, p_Comments, p_Status, p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_CompanyID, p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, p_AccessCount, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentNote"
            ("AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_AgentID, p_AgentNoteTypeID, p_Note, p_UserID, p_Type, p_IsAutoGenerated, p_Comments, p_Status, p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_CompanyID, p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, p_AccessCount, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateWorkflow"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_WorkflowEngineID UUID, IN p_ExternalSystemRecordID VARCHAR(100), IN p_AutoRunIntervalUnits VARCHAR(20), IN p_AutoRunInterval INTEGER, IN p_SubclassName VARCHAR(200), IN p_ID UUID DEFAULT NULL, IN p_AutoRunEnabled BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwWorkflows" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Workflow"
            ("ID", "Name", "Description", "WorkflowEngineID", "ExternalSystemRecordID", "AutoRunEnabled", "AutoRunIntervalUnits", "AutoRunInterval", "SubclassName")
        VALUES
            (p_ID, p_Name, p_Description, p_WorkflowEngineID, p_ExternalSystemRecordID, p_AutoRunEnabled, p_AutoRunIntervalUnits, p_AutoRunInterval, p_SubclassName)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Workflow"
            ("Name", "Description", "WorkflowEngineID", "ExternalSystemRecordID", "AutoRunEnabled", "AutoRunIntervalUnits", "AutoRunInterval", "SubclassName")
        VALUES
            (p_Name, p_Description, p_WorkflowEngineID, p_ExternalSystemRecordID, p_AutoRunEnabled, p_AutoRunIntervalUnits, p_AutoRunInterval, p_SubclassName)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwWorkflows" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNote"(IN p_ID UUID, IN p_AgentID UUID, IN p_AgentNoteTypeID UUID, IN p_Note TEXT, IN p_UserID UUID, IN p_Type VARCHAR(20), IN p_IsAutoGenerated BOOLEAN, IN p_Comments TEXT, IN p_Status VARCHAR(20), IN p_SourceConversationID UUID, IN p_SourceConversationDetailID UUID, IN p_SourceAIAgentRunID UUID, IN p_CompanyID UUID, IN p_EmbeddingVector TEXT, IN p_EmbeddingModelID UUID, IN p_PrimaryScopeEntityID UUID, IN p_PrimaryScopeRecordID VARCHAR(100), IN p_SecondaryScopes TEXT, IN p_LastAccessedAt TIMESTAMPTZ, IN p_AccessCount INTEGER, IN p_ExpiresAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwAIAgentNotes" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateComponent"(IN p_Namespace TEXT, IN p_Name VARCHAR(500), IN p_Version VARCHAR(50), IN p_Title VARCHAR(1000), IN p_Description TEXT, IN p_Type VARCHAR(255), IN p_Status VARCHAR(50), IN p_DeveloperName VARCHAR(255), IN p_DeveloperEmail VARCHAR(255), IN p_DeveloperOrganization VARCHAR(255), IN p_SourceRegistryID UUID, IN p_ReplicatedAt TIMESTAMPTZ, IN p_LastSyncedAt TIMESTAMPTZ, IN p_Specification TEXT, IN p_FunctionalRequirements TEXT, IN p_TechnicalDesign TEXT, IN p_FunctionalRequirementsVector TEXT, IN p_TechnicalDesignVector TEXT, IN p_TechnicalDesignVectorEmbeddingModelID TEXT, IN p_FunctionalRequirementsVectorEmbeddingModelID TEXT, IN p_ID UUID DEFAULT NULL, IN p_VersionSequence INTEGER DEFAULT NULL, IN p_HasCustomProps BOOLEAN DEFAULT NULL, IN p_HasCustomEvents BOOLEAN DEFAULT NULL, IN p_RequiresData BOOLEAN DEFAULT NULL, IN p_DependencyCount INTEGER DEFAULT NULL, IN p_HasRequiredCustomProps BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwComponents" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Component"
            ("ID", "Namespace", "Name", "Version", "VersionSequence", "Title", "Description", "Type", "Status", "DeveloperName", "DeveloperEmail", "DeveloperOrganization", "SourceRegistryID", "ReplicatedAt", "LastSyncedAt", "Specification", "FunctionalRequirements", "TechnicalDesign", "FunctionalRequirementsVector", "TechnicalDesignVector", "HasCustomProps", "HasCustomEvents", "RequiresData", "DependencyCount", "TechnicalDesignVectorEmbeddingModelID", "FunctionalRequirementsVectorEmbeddingModelID", "HasRequiredCustomProps")
        VALUES
            (p_ID, p_Namespace, p_Name, p_Version, p_VersionSequence, p_Title, p_Description, p_Type, p_Status, p_DeveloperName, p_DeveloperEmail, p_DeveloperOrganization, p_SourceRegistryID, p_ReplicatedAt, p_LastSyncedAt, p_Specification, p_FunctionalRequirements, p_TechnicalDesign, p_FunctionalRequirementsVector, p_TechnicalDesignVector, p_HasCustomProps, p_HasCustomEvents, p_RequiresData, p_DependencyCount, p_TechnicalDesignVectorEmbeddingModelID, p_FunctionalRequirementsVectorEmbeddingModelID, p_HasRequiredCustomProps)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Component"
            ("Namespace", "Name", "Version", "VersionSequence", "Title", "Description", "Type", "Status", "DeveloperName", "DeveloperEmail", "DeveloperOrganization", "SourceRegistryID", "ReplicatedAt", "LastSyncedAt", "Specification", "FunctionalRequirements", "TechnicalDesign", "FunctionalRequirementsVector", "TechnicalDesignVector", "HasCustomProps", "HasCustomEvents", "RequiresData", "DependencyCount", "TechnicalDesignVectorEmbeddingModelID", "FunctionalRequirementsVectorEmbeddingModelID", "HasRequiredCustomProps")
        VALUES
            (p_Namespace, p_Name, p_Version, p_VersionSequence, p_Title, p_Description, p_Type, p_Status, p_DeveloperName, p_DeveloperEmail, p_DeveloperOrganization, p_SourceRegistryID, p_ReplicatedAt, p_LastSyncedAt, p_Specification, p_FunctionalRequirements, p_TechnicalDesign, p_FunctionalRequirementsVector, p_TechnicalDesignVector, p_HasCustomProps, p_HasCustomEvents, p_RequiresData, p_DependencyCount, p_TechnicalDesignVectorEmbeddingModelID, p_FunctionalRequirementsVectorEmbeddingModelID, p_HasRequiredCustomProps)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwComponents" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocumentRun"(IN p_ID UUID, IN p_EntityDocumentID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Status VARCHAR(15))
RETURNS SETOF __mj."vwEntityDocumentRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityDocumentRun"
    SET
        "EntityDocumentID" = p_EntityDocumentID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocumentRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DashboardCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteReportVersion"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ReportVersion"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteReportUserState"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ReportUserState"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteReport"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Report"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCommunicationProviderMessageType"(IN p_CommunicationProviderID UUID, IN p_CommunicationBaseMessageTypeID UUID, IN p_Name VARCHAR(255), IN p_AdditionalAttributes TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwCommunicationProviderMessageTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CommunicationProviderMessageType"
            ("ID", "CommunicationProviderID", "CommunicationBaseMessageTypeID", "Name", "Status", "AdditionalAttributes")
        VALUES
            (p_ID, p_CommunicationProviderID, p_CommunicationBaseMessageTypeID, p_Name, p_Status, p_AdditionalAttributes)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CommunicationProviderMessageType"
            ("CommunicationProviderID", "CommunicationBaseMessageTypeID", "Name", "Status", "AdditionalAttributes")
        VALUES
            (p_CommunicationProviderID, p_CommunicationBaseMessageTypeID, p_Name, p_Status, p_AdditionalAttributes)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationProviderMessageTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueueType"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DriverClass VARCHAR(100), IN p_DriverImportPath VARCHAR(200), IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwQueueTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueueType"
            ("ID", "Name", "Description", "DriverClass", "DriverImportPath", "IsActive")
        VALUES
            (p_ID, p_Name, p_Description, p_DriverClass, p_DriverImportPath, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueueType"
            ("Name", "Description", "DriverClass", "DriverImportPath", "IsActive")
        VALUES
            (p_Name, p_Description, p_DriverClass, p_DriverImportPath, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueueTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRunStep"(IN p_AgentRunID UUID, IN p_StepNumber INTEGER, IN p_StepName VARCHAR(255), IN p_TargetID UUID, IN p_CompletedAt TIMESTAMPTZ, IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_InputData TEXT, IN p_OutputData TEXT, IN p_TargetLogID UUID, IN p_PayloadAtStart TEXT, IN p_PayloadAtEnd TEXT, IN p_FinalPayloadValidationResult VARCHAR(25), IN p_FinalPayloadValidationMessages TEXT, IN p_ParentID UUID, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_StepType VARCHAR(50) DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRunStep"
            ("ID", "AgentRunID", "StepNumber", "StepType", "StepName", "TargetID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "InputData", "OutputData", "TargetLogID", "PayloadAtStart", "PayloadAtEnd", "FinalPayloadValidationResult", "FinalPayloadValidationMessages", "ParentID", "Comments")
        VALUES
            (p_ID, p_AgentRunID, p_StepNumber, p_StepType, p_StepName, p_TargetID, p_Status, p_StartedAt, p_CompletedAt, p_Success, p_ErrorMessage, p_InputData, p_OutputData, p_TargetLogID, p_PayloadAtStart, p_PayloadAtEnd, p_FinalPayloadValidationResult, p_FinalPayloadValidationMessages, p_ParentID, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentRunStep" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateFileStorageProvider"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_ServerDriverKey VARCHAR(100), IN p_ClientDriverKey VARCHAR(100), IN p_Configuration TEXT, IN p_ID UUID DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_SupportsSearch BOOLEAN DEFAULT NULL, IN p_RequiresOAuth BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwFileStorageProviders" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."FileStorageProvider"
            ("ID", "Name", "Description", "ServerDriverKey", "ClientDriverKey", "Priority", "IsActive", "SupportsSearch", "Configuration", "RequiresOAuth")
        VALUES
            (p_ID, p_Name, p_Description, p_ServerDriverKey, p_ClientDriverKey, p_Priority, p_IsActive, p_SupportsSearch, p_Configuration, p_RequiresOAuth)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."FileStorageProvider"
            ("Name", "Description", "ServerDriverKey", "ClientDriverKey", "Priority", "IsActive", "SupportsSearch", "Configuration", "RequiresOAuth")
        VALUES
            (p_Name, p_Description, p_ServerDriverKey, p_ClientDriverKey, p_Priority, p_IsActive, p_SupportsSearch, p_Configuration, p_RequiresOAuth)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwFileStorageProviders" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserViewRun"(IN p_UserViewID UUID, IN p_RunAt TIMESTAMPTZ, IN p_RunByUserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwUserViewRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserViewRun"
            ("ID", "UserViewID", "RunAt", "RunByUserID")
        VALUES
            (p_ID, p_UserViewID, p_RunAt, p_RunByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserViewRun"
            ("UserViewID", "RunAt", "RunByUserID")
        VALUES
            (p_UserViewID, p_RunAt, p_RunByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserViewRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateSchemaInfo"(IN p_ID UUID, IN p_SchemaName VARCHAR(50), IN p_EntityIDMin INTEGER, IN p_EntityIDMax INTEGER, IN p_Comments TEXT, IN p_Description TEXT)
RETURNS SETOF __mj."vwSchemaInfos" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."SchemaInfo"
    SET
        "SchemaName" = p_SchemaName,
        "EntityIDMin" = p_EntityIDMin,
        "EntityIDMax" = p_EntityIDMax,
        "Comments" = p_Comments,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwSchemaInfos" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTag"(IN p_Name VARCHAR(255), IN p_ParentID UUID, IN p_DisplayName VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwTags" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelCost"(IN p_ID UUID, IN p_ModelID UUID, IN p_VendorID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_Currency CHAR(3), IN p_PriceTypeID UUID, IN p_InputPricePerUnit NUMERIC(18,8), IN p_OutputPricePerUnit NUMERIC(18,8), IN p_UnitTypeID UUID, IN p_ProcessingType VARCHAR(20), IN p_Comments TEXT)
RETURNS SETOF __mj."vwAIModelCosts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelCost"
    SET
        "ModelID" = p_ModelID,
        "VendorID" = p_VendorID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Status" = p_Status,
        "Currency" = p_Currency,
        "PriceTypeID" = p_PriceTypeID,
        "InputPricePerUnit" = p_InputPricePerUnit,
        "OutputPricePerUnit" = p_OutputPricePerUnit,
        "UnitTypeID" = p_UnitTypeID,
        "ProcessingType" = p_ProcessingType,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelCosts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNote"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentNote"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateFileStorageProvider"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_ServerDriverKey VARCHAR(100), IN p_ClientDriverKey VARCHAR(100), IN p_Priority INTEGER, IN p_IsActive BOOLEAN, IN p_SupportsSearch BOOLEAN, IN p_Configuration TEXT, IN p_RequiresOAuth BOOLEAN)
RETURNS SETOF __mj."vwFileStorageProviders" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."FileStorageProvider"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ServerDriverKey" = p_ServerDriverKey,
        "ClientDriverKey" = p_ClientDriverKey,
        "Priority" = p_Priority,
        "IsActive" = p_IsActive,
        "SupportsSearch" = p_SupportsSearch,
        "Configuration" = p_Configuration,
        "RequiresOAuth" = p_RequiresOAuth
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwFileStorageProviders" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocument"(IN p_Name VARCHAR(250), IN p_TypeID UUID, IN p_EntityID UUID, IN p_VectorDatabaseID UUID, IN p_TemplateID UUID, IN p_AIModelID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(15) DEFAULT NULL, IN p_PotentialMatchThreshold NUMERIC(12,11) DEFAULT NULL, IN p_AbsoluteMatchThreshold NUMERIC(12,11) DEFAULT NULL)
RETURNS SETOF __mj."vwEntityDocuments" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityDocument"
            ("ID", "Name", "TypeID", "EntityID", "VectorDatabaseID", "Status", "TemplateID", "AIModelID", "PotentialMatchThreshold", "AbsoluteMatchThreshold")
        VALUES
            (p_ID, p_Name, p_TypeID, p_EntityID, p_VectorDatabaseID, p_Status, p_TemplateID, p_AIModelID, p_PotentialMatchThreshold, p_AbsoluteMatchThreshold)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityDocument"
            ("Name", "TypeID", "EntityID", "VectorDatabaseID", "Status", "TemplateID", "AIModelID", "PotentialMatchThreshold", "AbsoluteMatchThreshold")
        VALUES
            (p_Name, p_TypeID, p_EntityID, p_VectorDatabaseID, p_Status, p_TemplateID, p_AIModelID, p_PotentialMatchThreshold, p_AbsoluteMatchThreshold)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateLibrary"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_TypeDefinitions TEXT, IN p_SampleCode TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwLibraries" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Library"
            ("ID", "Name", "Description", "Status", "TypeDefinitions", "SampleCode")
        VALUES
            (p_ID, p_Name, p_Description, p_Status, p_TypeDefinitions, p_SampleCode)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Library"
            ("Name", "Description", "Status", "TypeDefinitions", "SampleCode")
        VALUES
            (p_Name, p_Description, p_Status, p_TypeDefinitions, p_SampleCode)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwLibraries" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordChange"(IN p_ID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(750), IN p_UserID UUID, IN p_Type VARCHAR(20), IN p_Source VARCHAR(20), IN p_ChangedAt TIMESTAMPTZ, IN p_ChangesJSON TEXT, IN p_ChangesDescription TEXT, IN p_FullRecordJSON TEXT, IN p_Status VARCHAR(50), IN p_ErrorLog TEXT, IN p_ReplayRunID UUID, IN p_IntegrationID UUID, IN p_Comments TEXT)
RETURNS SETOF __mj."vwRecordChanges" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecordChange"
    SET
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "UserID" = p_UserID,
        "Type" = p_Type,
        "Source" = p_Source,
        "ChangedAt" = p_ChangedAt,
        "ChangesJSON" = p_ChangesJSON,
        "ChangesDescription" = p_ChangesDescription,
        "FullRecordJSON" = p_FullRecordJSON,
        "Status" = p_Status,
        "ErrorLog" = p_ErrorLog,
        "ReplayRunID" = p_ReplayRunID,
        "IntegrationID" = p_IntegrationID,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntitySetting"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntitySetting"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateExplorerNavigationItem"(IN p_ID UUID, IN p_Sequence INTEGER, IN p_Name VARCHAR(100), IN p_Route VARCHAR(255), IN p_IsActive BOOLEAN, IN p_ShowInHomeScreen BOOLEAN, IN p_ShowInNavigationDrawer BOOLEAN, IN p_IconCSSClass VARCHAR(100), IN p_Description TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwExplorerNavigationItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ExplorerNavigationItem"
    SET
        "Sequence" = p_Sequence,
        "Name" = p_Name,
        "Route" = p_Route,
        "IsActive" = p_IsActive,
        "ShowInHomeScreen" = p_ShowInHomeScreen,
        "ShowInNavigationDrawer" = p_ShowInNavigationDrawer,
        "IconCSSClass" = p_IconCSSClass,
        "Description" = p_Description,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwExplorerNavigationItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionInvocation"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityActionInvocation"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDataContext"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_UserID UUID, IN p_LastRefreshedAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwDataContexts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DataContext"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "UserID" = p_UserID,
        "LastRefreshedAt" = p_LastRefreshedAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDataContexts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateVersionLabelItem"(IN p_VersionLabelID UUID, IN p_RecordChangeID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(750), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwVersionLabelItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."VersionLabelItem"
            ("ID", "VersionLabelID", "RecordChangeID", "EntityID", "RecordID")
        VALUES
            (p_ID, p_VersionLabelID, p_RecordChangeID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."VersionLabelItem"
            ("VersionLabelID", "RecordChangeID", "EntityID", "RecordID")
        VALUES
            (p_VersionLabelID, p_RecordChangeID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwVersionLabelItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTemplate"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CategoryID UUID, IN p_UserPrompt TEXT, IN p_UserID UUID, IN p_ActiveAt TIMESTAMPTZ, IN p_DisabledAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwTemplates" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Template"
            ("ID", "Name", "Description", "CategoryID", "UserPrompt", "UserID", "ActiveAt", "DisabledAt", "IsActive")
        VALUES
            (p_ID, p_Name, p_Description, p_CategoryID, p_UserPrompt, p_UserID, p_ActiveAt, p_DisabledAt, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Template"
            ("Name", "Description", "CategoryID", "UserPrompt", "UserID", "ActiveAt", "DisabledAt", "IsActive")
        VALUES
            (p_Name, p_Description, p_CategoryID, p_UserPrompt, p_UserID, p_ActiveAt, p_DisabledAt, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTemplates" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailArtifact"(IN p_ConversationDetailID UUID, IN p_ArtifactVersionID UUID, IN p_ID UUID DEFAULT NULL, IN p_Direction VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwConversationDetailArtifacts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationDetailArtifact"
            ("ID", "ConversationDetailID", "ArtifactVersionID", "Direction")
        VALUES
            (p_ID, p_ConversationDetailID, p_ArtifactVersionID, p_Direction)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationDetailArtifact"
            ("ConversationDetailID", "ArtifactVersionID", "Direction")
        VALUES
            (p_ConversationDetailID, p_ArtifactVersionID, p_Direction)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteFileStorageProvider"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."FileStorageProvider"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEncryptionKey"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_EncryptionKeySourceID UUID, IN p_EncryptionAlgorithmID UUID, IN p_KeyLookupValue VARCHAR(500), IN p_ActivatedAt TIMESTAMPTZ, IN p_ExpiresAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_KeyVersion VARCHAR(20) DEFAULT NULL, IN p_Marker VARCHAR(20) DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwEncryptionKeys" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EncryptionKey"
            ("ID", "Name", "Description", "EncryptionKeySourceID", "EncryptionAlgorithmID", "KeyLookupValue", "KeyVersion", "Marker", "IsActive", "Status", "ActivatedAt", "ExpiresAt")
        VALUES
            (p_ID, p_Name, p_Description, p_EncryptionKeySourceID, p_EncryptionAlgorithmID, p_KeyLookupValue, p_KeyVersion, p_Marker, p_IsActive, p_Status, p_ActivatedAt, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EncryptionKey"
            ("Name", "Description", "EncryptionKeySourceID", "EncryptionAlgorithmID", "KeyLookupValue", "KeyVersion", "Marker", "IsActive", "Status", "ActivatedAt", "ExpiresAt")
        VALUES
            (p_Name, p_Description, p_EncryptionKeySourceID, p_EncryptionAlgorithmID, p_KeyLookupValue, p_KeyVersion, p_Marker, p_IsActive, p_Status, p_ActivatedAt, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEncryptionKeys" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserApplicationEntity"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserApplicationEntity"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVersionLabelItem"(IN p_ID UUID, IN p_VersionLabelID UUID, IN p_RecordChangeID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(750))
RETURNS SETOF __mj."vwVersionLabelItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."VersionLabelItem"
    SET
        "VersionLabelID" = p_VersionLabelID,
        "RecordChangeID" = p_RecordChangeID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwVersionLabelItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSource"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_ContentTypeID UUID, IN p_ContentSourceTypeID UUID, IN p_ContentFileTypeID UUID, IN p_URL VARCHAR(2000))
RETURNS SETOF __mj."vwContentSources" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentSource"
    SET
        "Name" = p_Name,
        "ContentTypeID" = p_ContentTypeID,
        "ContentSourceTypeID" = p_ContentSourceTypeID,
        "ContentFileTypeID" = p_ContentFileTypeID,
        "URL" = p_URL
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentSources" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserView"(IN p_ID UUID, IN p_UserID UUID, IN p_EntityID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_CategoryID UUID, IN p_IsShared BOOLEAN, IN p_IsDefault BOOLEAN, IN p_GridState TEXT, IN p_FilterState TEXT, IN p_CustomFilterState BOOLEAN, IN p_SmartFilterEnabled BOOLEAN, IN p_SmartFilterPrompt TEXT, IN p_SmartFilterWhereClause TEXT, IN p_SmartFilterExplanation TEXT, IN p_WhereClause TEXT, IN p_CustomWhereClause BOOLEAN, IN p_SortState TEXT, IN p_Thumbnail TEXT, IN p_CardState TEXT, IN p_DisplayState TEXT)
RETURNS SETOF __mj."vwUserViews" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserView"
    SET
        "UserID" = p_UserID,
        "EntityID" = p_EntityID,
        "Name" = p_Name,
        "Description" = p_Description,
        "CategoryID" = p_CategoryID,
        "IsShared" = p_IsShared,
        "IsDefault" = p_IsDefault,
        "GridState" = p_GridState,
        "FilterState" = p_FilterState,
        "CustomFilterState" = p_CustomFilterState,
        "SmartFilterEnabled" = p_SmartFilterEnabled,
        "SmartFilterPrompt" = p_SmartFilterPrompt,
        "SmartFilterWhereClause" = p_SmartFilterWhereClause,
        "SmartFilterExplanation" = p_SmartFilterExplanation,
        "WhereClause" = p_WhereClause,
        "CustomWhereClause" = p_CustomWhereClause,
        "SortState" = p_SortState,
        "Thumbnail" = p_Thumbnail,
        "CardState" = p_CardState,
        "DisplayState" = p_DisplayState
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserViews" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueryPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."QueryPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentAction"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentAction"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentProcessRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentProcessRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCollectionPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CollectionPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateWorkflow"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_WorkflowEngineID UUID, IN p_ExternalSystemRecordID VARCHAR(100), IN p_AutoRunEnabled BOOLEAN, IN p_AutoRunIntervalUnits VARCHAR(20), IN p_AutoRunInterval INTEGER, IN p_SubclassName VARCHAR(200))
RETURNS SETOF __mj."vwWorkflows" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Workflow"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "WorkflowEngineID" = p_WorkflowEngineID,
        "ExternalSystemRecordID" = p_ExternalSystemRecordID,
        "AutoRunEnabled" = p_AutoRunEnabled,
        "AutoRunIntervalUnits" = p_AutoRunIntervalUnits,
        "AutoRunInterval" = p_AutoRunInterval,
        "SubclassName" = p_SubclassName
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwWorkflows" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateFileStorageAccount"(IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_ProviderID UUID, IN p_CredentialID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwFileStorageAccounts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."FileStorageAccount"
            ("ID", "Name", "Description", "ProviderID", "CredentialID")
        VALUES
            (p_ID, p_Name, p_Description, p_ProviderID, p_CredentialID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."FileStorageAccount"
            ("Name", "Description", "ProviderID", "CredentialID")
        VALUES
            (p_Name, p_Description, p_ProviderID, p_CredentialID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwFileStorageAccounts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateResourceLink"(IN p_UserID UUID, IN p_ResourceTypeID UUID, IN p_ResourceRecordID VARCHAR(255), IN p_FolderID VARCHAR(255), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwResourceLinks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ResourceLink"
            ("ID", "UserID", "ResourceTypeID", "ResourceRecordID", "FolderID")
        VALUES
            (p_ID, p_UserID, p_ResourceTypeID, p_ResourceRecordID, p_FolderID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ResourceLink"
            ("UserID", "ResourceTypeID", "ResourceRecordID", "FolderID")
        VALUES
            (p_UserID, p_ResourceTypeID, p_ResourceRecordID, p_FolderID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwResourceLinks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVersionLabelItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."VersionLabelItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocumentSetting"(IN p_EntityDocumentID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityDocumentSettings" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityDocumentSetting"
            ("ID", "EntityDocumentID", "Name", "Value", "Comments")
        VALUES
            (p_ID, p_EntityDocumentID, p_Name, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityDocumentSetting"
            ("EntityDocumentID", "Name", "Value", "Comments")
        VALUES
            (p_EntityDocumentID, p_Name, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocumentSettings" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIArchitecture"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Category VARCHAR(50), IN p_ParentArchitectureID UUID, IN p_WikipediaURL VARCHAR(500), IN p_YearIntroduced INTEGER, IN p_KeyPaper VARCHAR(500), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIArchitectures" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionCategory"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ParentID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwActionCategories" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionCategory"
            ("ID", "Name", "Description", "ParentID", "Status")
        VALUES
            (p_ID, p_Name, p_Description, p_ParentID, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionCategory"
            ("Name", "Description", "ParentID", "Status")
        VALUES
            (p_Name, p_Description, p_ParentID, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionCategories" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateOutputTriggerType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwOutputTriggerTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."OutputTriggerType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."OutputTriggerType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwOutputTriggerTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateFileStorageAccount"(IN p_ID UUID, IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_ProviderID UUID, IN p_CredentialID UUID)
RETURNS SETOF __mj."vwFileStorageAccounts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."FileStorageAccount"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ProviderID" = p_ProviderID,
        "CredentialID" = p_CredentialID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwFileStorageAccounts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocument"(IN p_ID UUID, IN p_Name VARCHAR(250), IN p_TypeID UUID, IN p_EntityID UUID, IN p_VectorDatabaseID UUID, IN p_Status VARCHAR(15), IN p_TemplateID UUID, IN p_AIModelID UUID, IN p_PotentialMatchThreshold NUMERIC(12,11), IN p_AbsoluteMatchThreshold NUMERIC(12,11))
RETURNS SETOF __mj."vwEntityDocuments" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityDocument"
    SET
        "Name" = p_Name,
        "TypeID" = p_TypeID,
        "EntityID" = p_EntityID,
        "VectorDatabaseID" = p_VectorDatabaseID,
        "Status" = p_Status,
        "TemplateID" = p_TemplateID,
        "AIModelID" = p_AIModelID,
        "PotentialMatchThreshold" = p_PotentialMatchThreshold,
        "AbsoluteMatchThreshold" = p_AbsoluteMatchThreshold
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateFile"(IN p_ID UUID, IN p_Name VARCHAR(500), IN p_Description TEXT, IN p_CategoryID UUID, IN p_ProviderID UUID, IN p_ContentType VARCHAR(255), IN p_ProviderKey VARCHAR(500), IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwFiles" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."File"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "CategoryID" = p_CategoryID,
        "ProviderID" = p_ProviderID,
        "ContentType" = p_ContentType,
        "ProviderKey" = p_ProviderKey,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwFiles" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueueType"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DriverClass VARCHAR(100), IN p_DriverImportPath VARCHAR(200), IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwQueueTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."QueueType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "DriverImportPath" = p_DriverImportPath,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueueTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledAction"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CreatedByUserID UUID, IN p_ActionID UUID, IN p_Type VARCHAR(20), IN p_CronExpression VARCHAR(100), IN p_Timezone VARCHAR(100), IN p_Status VARCHAR(20), IN p_IntervalDays INTEGER, IN p_DayOfWeek VARCHAR(20), IN p_DayOfMonth INTEGER, IN p_Month VARCHAR(20), IN p_CustomCronExpression VARCHAR(255))
RETURNS SETOF __mj."vwScheduledActions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ScheduledAction"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "CreatedByUserID" = p_CreatedByUserID,
        "ActionID" = p_ActionID,
        "Type" = p_Type,
        "CronExpression" = p_CronExpression,
        "Timezone" = p_Timezone,
        "Status" = p_Status,
        "IntervalDays" = p_IntervalDays,
        "DayOfWeek" = p_DayOfWeek,
        "DayOfMonth" = p_DayOfMonth,
        "Month" = p_Month,
        "CustomCronExpression" = p_CustomCronExpression
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwScheduledActions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestSuiteTest"(IN p_SuiteID UUID, IN p_TestID UUID, IN p_Configuration TEXT, IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwTestSuiteTests" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestSuiteTest"
            ("ID", "SuiteID", "TestID", "Sequence", "Status", "Configuration")
        VALUES
            (p_ID, p_SuiteID, p_TestID, p_Sequence, p_Status, p_Configuration)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestSuiteTest"
            ("SuiteID", "TestID", "Sequence", "Status", "Configuration")
        VALUES
            (p_SuiteID, p_TestID, p_Sequence, p_Status, p_Configuration)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestSuiteTests" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTask"(IN p_ID UUID, IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_TypeID UUID, IN p_EnvironmentID UUID, IN p_ProjectID UUID, IN p_ConversationDetailID UUID, IN p_UserID UUID, IN p_AgentID UUID, IN p_Status VARCHAR(50), IN p_PercentComplete INTEGER, IN p_DueAt TIMESTAMPTZ, IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwTasks" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateVersionLabelRestore"(IN p_VersionLabelID UUID, IN p_EndedAt TIMESTAMPTZ, IN p_UserID UUID, IN p_ErrorLog TEXT, IN p_PreRestoreLabelID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL, IN p_TotalItems INTEGER DEFAULT NULL, IN p_CompletedItems INTEGER DEFAULT NULL, IN p_FailedItems INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwVersionLabelRestores" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."VersionLabelRestore"
            ("ID", "VersionLabelID", "Status", "StartedAt", "EndedAt", "UserID", "TotalItems", "CompletedItems", "FailedItems", "ErrorLog", "PreRestoreLabelID")
        VALUES
            (p_ID, p_VersionLabelID, p_Status, p_StartedAt, p_EndedAt, p_UserID, p_TotalItems, p_CompletedItems, p_FailedItems, p_ErrorLog, p_PreRestoreLabelID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."VersionLabelRestore"
            ("VersionLabelID", "Status", "StartedAt", "EndedAt", "UserID", "TotalItems", "CompletedItems", "FailedItems", "ErrorLog", "PreRestoreLabelID")
        VALUES
            (p_VersionLabelID, p_Status, p_StartedAt, p_EndedAt, p_UserID, p_TotalItems, p_CompletedItems, p_FailedItems, p_ErrorLog, p_PreRestoreLabelID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwVersionLabelRestores" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreatePublicLink"(IN p_ResourceType VARCHAR(50), IN p_ResourceID UUID, IN p_Token VARCHAR(255), IN p_PasswordHash VARCHAR(255), IN p_ExpiresAt TIMESTAMPTZ, IN p_MaxViews INTEGER, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL, IN p_CurrentViews INTEGER DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwPublicLinks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."PublicLink"
            ("ID", "ResourceType", "ResourceID", "Token", "PasswordHash", "ExpiresAt", "MaxViews", "CurrentViews", "UserID", "IsActive")
        VALUES
            (p_ID, p_ResourceType, p_ResourceID, p_Token, p_PasswordHash, p_ExpiresAt, p_MaxViews, p_CurrentViews, p_UserID, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."PublicLink"
            ("ResourceType", "ResourceID", "Token", "PasswordHash", "ExpiresAt", "MaxViews", "CurrentViews", "UserID", "IsActive")
        VALUES
            (p_ResourceType, p_ResourceID, p_Token, p_PasswordHash, p_ExpiresAt, p_MaxViews, p_CurrentViews, p_UserID, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwPublicLinks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCredential"(IN p_CredentialTypeID UUID, IN p_CategoryID UUID, IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_Values TEXT, IN p_ExpiresAt TIMESTAMPTZ, IN p_LastValidatedAt TIMESTAMPTZ, IN p_LastUsedAt TIMESTAMPTZ, IN p_IconClass VARCHAR(100), IN p_ID UUID DEFAULT NULL, IN p_IsDefault BOOLEAN DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwCredentials" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Credential"
            ("ID", "CredentialTypeID", "CategoryID", "Name", "Description", "Values", "IsDefault", "IsActive", "ExpiresAt", "LastValidatedAt", "LastUsedAt", "IconClass")
        VALUES
            (p_ID, p_CredentialTypeID, p_CategoryID, p_Name, p_Description, p_Values, p_IsDefault, p_IsActive, p_ExpiresAt, p_LastValidatedAt, p_LastUsedAt, p_IconClass)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Credential"
            ("CredentialTypeID", "CategoryID", "Name", "Description", "Values", "IsDefault", "IsActive", "ExpiresAt", "LastValidatedAt", "LastUsedAt", "IconClass")
        VALUES
            (p_CredentialTypeID, p_CategoryID, p_Name, p_Description, p_Values, p_IsDefault, p_IsActive, p_ExpiresAt, p_LastValidatedAt, p_LastUsedAt, p_IconClass)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCredentials" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAuditLogType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AuditLogType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteErrorLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ErrorLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentExample"(IN p_AgentID UUID, IN p_UserID UUID, IN p_CompanyID UUID, IN p_ExampleInput TEXT, IN p_ExampleOutput TEXT, IN p_SourceConversationID UUID, IN p_SourceConversationDetailID UUID, IN p_SourceAIAgentRunID UUID, IN p_SuccessScore NUMERIC(5,2), IN p_Comments TEXT, IN p_EmbeddingVector TEXT, IN p_EmbeddingModelID UUID, IN p_PrimaryScopeEntityID UUID, IN p_PrimaryScopeRecordID VARCHAR(100), IN p_SecondaryScopes TEXT, IN p_LastAccessedAt TIMESTAMPTZ, IN p_ExpiresAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(20) DEFAULT NULL, IN p_IsAutoGenerated BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_AccessCount INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentExamples" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentExample"
            ("ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_ID, p_AgentID, p_UserID, p_CompanyID, p_Type, p_ExampleInput, p_ExampleOutput, p_IsAutoGenerated, p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_SuccessScore, p_Comments, p_Status, p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, p_AccessCount, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentExample"
            ("AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt")
        VALUES
            (p_AgentID, p_UserID, p_CompanyID, p_Type, p_ExampleInput, p_ExampleOutput, p_IsAutoGenerated, p_SourceConversationID, p_SourceConversationDetailID, p_SourceAIAgentRunID, p_SuccessScore, p_Comments, p_Status, p_EmbeddingVector, p_EmbeddingModelID, p_PrimaryScopeEntityID, p_PrimaryScopeRecordID, p_SecondaryScopes, p_LastAccessedAt, p_AccessCount, p_ExpiresAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentExamples" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateListInvitation"(IN p_ID UUID, IN p_ListID UUID, IN p_Email VARCHAR(255), IN p_Role VARCHAR(50), IN p_Token VARCHAR(100), IN p_ExpiresAt TIMESTAMP, IN p_CreatedByUserID UUID, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwListInvitations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ListInvitation"
    SET
        "ListID" = p_ListID,
        "Email" = p_Email,
        "Role" = p_Role,
        "Token" = p_Token,
        "ExpiresAt" = p_ExpiresAt,
        "CreatedByUserID" = p_CreatedByUserID,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwListInvitations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRunStep"(IN p_ID UUID, IN p_AgentRunID UUID, IN p_StepNumber INTEGER, IN p_StepType VARCHAR(50), IN p_StepName VARCHAR(255), IN p_TargetID UUID, IN p_Status VARCHAR(50), IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_InputData TEXT, IN p_OutputData TEXT, IN p_TargetLogID UUID, IN p_PayloadAtStart TEXT, IN p_PayloadAtEnd TEXT, IN p_FinalPayloadValidationResult VARCHAR(25), IN p_FinalPayloadValidationMessages TEXT, IN p_ParentID UUID, IN p_Comments TEXT)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentRunStep"
    SET
        "AgentRunID" = p_AgentRunID,
        "StepNumber" = p_StepNumber,
        "StepType" = p_StepType,
        "StepName" = p_StepName,
        "TargetID" = p_TargetID,
        "Status" = p_Status,
        "StartedAt" = p_StartedAt,
        "CompletedAt" = p_CompletedAt,
        "Success" = p_Success,
        "ErrorMessage" = p_ErrorMessage,
        "InputData" = p_InputData,
        "OutputData" = p_OutputData,
        "TargetLogID" = p_TargetLogID,
        "PayloadAtStart" = p_PayloadAtStart,
        "PayloadAtEnd" = p_PayloadAtEnd,
        "FinalPayloadValidationResult" = p_FinalPayloadValidationResult,
        "FinalPayloadValidationMessages" = p_FinalPayloadValidationMessages,
        "ParentID" = p_ParentID,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT p_ID AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteFileStorageAccount"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."FileStorageAccount"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVersionLabelRestore"(IN p_ID UUID, IN p_VersionLabelID UUID, IN p_Status VARCHAR(50), IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_UserID UUID, IN p_TotalItems INTEGER, IN p_CompletedItems INTEGER, IN p_FailedItems INTEGER, IN p_ErrorLog TEXT, IN p_PreRestoreLabelID UUID)
RETURNS SETOF __mj."vwVersionLabelRestores" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."VersionLabelRestore"
    SET
        "VersionLabelID" = p_VersionLabelID,
        "Status" = p_Status,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "UserID" = p_UserID,
        "TotalItems" = p_TotalItems,
        "CompletedItems" = p_CompletedItems,
        "FailedItems" = p_FailedItems,
        "ErrorLog" = p_ErrorLog,
        "PreRestoreLabelID" = p_PreRestoreLabelID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwVersionLabelRestores" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelArchitecture"(IN p_ModelID UUID, IN p_ArchitectureID UUID, IN p_Weight NUMERIC(5,4), IN p_Notes VARCHAR(500), IN p_ID UUID DEFAULT NULL, IN p_Rank INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelArchitectures" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelArchitecture"
            ("ID", "ModelID", "ArchitectureID", "Rank", "Weight", "Notes")
        VALUES
            (p_ID, p_ModelID, p_ArchitectureID, p_Rank, p_Weight, p_Notes)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelArchitecture"
            ("ModelID", "ArchitectureID", "Rank", "Weight", "Notes")
        VALUES
            (p_ModelID, p_ArchitectureID, p_Rank, p_Weight, p_Notes)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelArchitectures" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCommunicationProviderMessageType"(IN p_ID UUID, IN p_CommunicationProviderID UUID, IN p_CommunicationBaseMessageTypeID UUID, IN p_Name VARCHAR(255), IN p_Status VARCHAR(20), IN p_AdditionalAttributes TEXT)
RETURNS SETOF __mj."vwCommunicationProviderMessageTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CommunicationProviderMessageType"
    SET
        "CommunicationProviderID" = p_CommunicationProviderID,
        "CommunicationBaseMessageTypeID" = p_CommunicationBaseMessageTypeID,
        "Name" = p_Name,
        "Status" = p_Status,
        "AdditionalAttributes" = p_AdditionalAttributes
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationProviderMessageTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecommendationRun"(IN p_ID UUID, IN p_RecommendationProviderID UUID, IN p_StartDate TIMESTAMPTZ, IN p_EndDate TIMESTAMPTZ, IN p_Status VARCHAR(50), IN p_Description TEXT, IN p_RunByUserID UUID)
RETURNS SETOF __mj."vwRecommendationRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecommendationRun"
    SET
        "RecommendationProviderID" = p_RecommendationProviderID,
        "StartDate" = p_StartDate,
        "EndDate" = p_EndDate,
        "Status" = p_Status,
        "Description" = p_Description,
        "RunByUserID" = p_RunByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecommendationRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentExample"(IN p_ID UUID, IN p_AgentID UUID, IN p_UserID UUID, IN p_CompanyID UUID, IN p_Type VARCHAR(20), IN p_ExampleInput TEXT, IN p_ExampleOutput TEXT, IN p_IsAutoGenerated BOOLEAN, IN p_SourceConversationID UUID, IN p_SourceConversationDetailID UUID, IN p_SourceAIAgentRunID UUID, IN p_SuccessScore NUMERIC(5,2), IN p_Comments TEXT, IN p_Status VARCHAR(20), IN p_EmbeddingVector TEXT, IN p_EmbeddingModelID UUID, IN p_PrimaryScopeEntityID UUID, IN p_PrimaryScopeRecordID VARCHAR(100), IN p_SecondaryScopes TEXT, IN p_LastAccessedAt TIMESTAMPTZ, IN p_AccessCount INTEGER, IN p_ExpiresAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwAIAgentExamples" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateComponent"(IN p_ID UUID, IN p_Namespace TEXT, IN p_Name VARCHAR(500), IN p_Version VARCHAR(50), IN p_VersionSequence INTEGER, IN p_Title VARCHAR(1000), IN p_Description TEXT, IN p_Type VARCHAR(255), IN p_Status VARCHAR(50), IN p_DeveloperName VARCHAR(255), IN p_DeveloperEmail VARCHAR(255), IN p_DeveloperOrganization VARCHAR(255), IN p_SourceRegistryID UUID, IN p_ReplicatedAt TIMESTAMPTZ, IN p_LastSyncedAt TIMESTAMPTZ, IN p_Specification TEXT, IN p_FunctionalRequirements TEXT, IN p_TechnicalDesign TEXT, IN p_FunctionalRequirementsVector TEXT, IN p_TechnicalDesignVector TEXT, IN p_HasCustomProps BOOLEAN, IN p_HasCustomEvents BOOLEAN, IN p_RequiresData BOOLEAN, IN p_DependencyCount INTEGER, IN p_TechnicalDesignVectorEmbeddingModelID TEXT, IN p_FunctionalRequirementsVectorEmbeddingModelID TEXT, IN p_HasRequiredCustomProps BOOLEAN)
RETURNS SETOF __mj."vwComponents" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Component"
    SET
        "Namespace" = p_Namespace,
        "Name" = p_Name,
        "Version" = p_Version,
        "VersionSequence" = p_VersionSequence,
        "Title" = p_Title,
        "Description" = p_Description,
        "Type" = p_Type,
        "Status" = p_Status,
        "DeveloperName" = p_DeveloperName,
        "DeveloperEmail" = p_DeveloperEmail,
        "DeveloperOrganization" = p_DeveloperOrganization,
        "SourceRegistryID" = p_SourceRegistryID,
        "ReplicatedAt" = p_ReplicatedAt,
        "LastSyncedAt" = p_LastSyncedAt,
        "Specification" = p_Specification,
        "FunctionalRequirements" = p_FunctionalRequirements,
        "TechnicalDesign" = p_TechnicalDesign,
        "FunctionalRequirementsVector" = p_FunctionalRequirementsVector,
        "TechnicalDesignVector" = p_TechnicalDesignVector,
        "HasCustomProps" = p_HasCustomProps,
        "HasCustomEvents" = p_HasCustomEvents,
        "RequiresData" = p_RequiresData,
        "DependencyCount" = p_DependencyCount,
        "TechnicalDesignVectorEmbeddingModelID" = p_TechnicalDesignVectorEmbeddingModelID,
        "FunctionalRequirementsVectorEmbeddingModelID" = p_FunctionalRequirementsVectorEmbeddingModelID,
        "HasRequiredCustomProps" = p_HasRequiredCustomProps
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwComponents" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateResourceType"(IN p_Name VARCHAR(255), IN p_DisplayName VARCHAR(255), IN p_Description TEXT, IN p_Icon VARCHAR(100), IN p_EntityID UUID, IN p_CategoryEntityID UUID, IN p_DriverClass VARCHAR(255), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwResourceTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ResourceType"
            ("ID", "Name", "DisplayName", "Description", "Icon", "EntityID", "CategoryEntityID", "DriverClass")
        VALUES
            (p_ID, p_Name, p_DisplayName, p_Description, p_Icon, p_EntityID, p_CategoryEntityID, p_DriverClass)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ResourceType"
            ("Name", "DisplayName", "Description", "Icon", "EntityID", "CategoryEntityID", "DriverClass")
        VALUES
            (p_Name, p_DisplayName, p_Description, p_Icon, p_EntityID, p_CategoryEntityID, p_DriverClass)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwResourceTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEncryptionKey"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_EncryptionKeySourceID UUID, IN p_EncryptionAlgorithmID UUID, IN p_KeyLookupValue VARCHAR(500), IN p_KeyVersion VARCHAR(20), IN p_Marker VARCHAR(20), IN p_IsActive BOOLEAN, IN p_Status VARCHAR(20), IN p_ActivatedAt TIMESTAMPTZ, IN p_ExpiresAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwEncryptionKeys" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EncryptionKey"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "EncryptionKeySourceID" = p_EncryptionKeySourceID,
        "EncryptionAlgorithmID" = p_EncryptionAlgorithmID,
        "KeyLookupValue" = p_KeyLookupValue,
        "KeyVersion" = p_KeyVersion,
        "Marker" = p_Marker,
        "IsActive" = p_IsActive,
        "Status" = p_Status,
        "ActivatedAt" = p_ActivatedAt,
        "ExpiresAt" = p_ExpiresAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEncryptionKeys" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateLibrary"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Status VARCHAR(20), IN p_TypeDefinitions TEXT, IN p_SampleCode TEXT)
RETURNS SETOF __mj."vwLibraries" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Library"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Status" = p_Status,
        "TypeDefinitions" = p_TypeDefinitions,
        "SampleCode" = p_SampleCode
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwLibraries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordMergeDeletionLog"(IN p_RecordMergeLogID UUID, IN p_DeletedRecordID VARCHAR(750), IN p_ProcessingLog TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(10) DEFAULT NULL)
RETURNS SETOF __mj."vwRecordMergeDeletionLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecordMergeDeletionLog"
            ("ID", "RecordMergeLogID", "DeletedRecordID", "Status", "ProcessingLog")
        VALUES
            (p_ID, p_RecordMergeLogID, p_DeletedRecordID, p_Status, p_ProcessingLog)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecordMergeDeletionLog"
            ("RecordMergeLogID", "DeletedRecordID", "Status", "ProcessingLog")
        VALUES
            (p_RecordMergeLogID, p_DeletedRecordID, p_Status, p_ProcessingLog)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecordMergeDeletionLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionInvocation"(IN p_EntityActionID UUID, IN p_InvocationTypeID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwEntityActionInvocations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityActionInvocation"
            ("ID", "EntityActionID", "InvocationTypeID", "Status")
        VALUES
            (p_ID, p_EntityActionID, p_InvocationTypeID, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityActionInvocation"
            ("EntityActionID", "InvocationTypeID", "Status")
        VALUES
            (p_EntityActionID, p_InvocationTypeID, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionParam"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityActionParam"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateResourceLink"(IN p_ID UUID, IN p_UserID UUID, IN p_ResourceTypeID UUID, IN p_ResourceRecordID VARCHAR(255), IN p_FolderID VARCHAR(255))
RETURNS SETOF __mj."vwResourceLinks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ResourceLink"
    SET
        "UserID" = p_UserID,
        "ResourceTypeID" = p_ResourceTypeID,
        "ResourceRecordID" = p_ResourceRecordID,
        "FolderID" = p_FolderID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwResourceLinks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVersionLabelRestore"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."VersionLabelRestore"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentFileType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentFileType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(IN p_PromptID UUID, IN p_ModelID UUID, IN p_VendorID UUID, IN p_AgentID UUID, IN p_ConfigurationID UUID, IN p_CompletedAt TIMESTAMPTZ, IN p_ExecutionTimeMS INTEGER, IN p_Messages TEXT, IN p_Result TEXT, IN p_TokensUsed INTEGER, IN p_TokensPrompt INTEGER, IN p_TokensCompletion INTEGER, IN p_TotalCost NUMERIC(18,6), IN p_ErrorMessage TEXT, IN p_ParentID UUID, IN p_ExecutionOrder INTEGER, IN p_AgentRunID UUID, IN p_Cost NUMERIC(19,8), IN p_CostCurrency VARCHAR(10), IN p_TokensUsedRollup INTEGER, IN p_TokensPromptRollup INTEGER, IN p_TokensCompletionRollup INTEGER, IN p_Temperature NUMERIC(3,2), IN p_TopP NUMERIC(3,2), IN p_TopK INTEGER, IN p_MinP NUMERIC(3,2), IN p_FrequencyPenalty NUMERIC(3,2), IN p_PresencePenalty NUMERIC(3,2), IN p_Seed INTEGER, IN p_StopSequences TEXT, IN p_ResponseFormat VARCHAR(50), IN p_LogProbs BOOLEAN, IN p_TopLogProbs INTEGER, IN p_DescendantCost NUMERIC(18,6), IN p_ValidationAttemptCount INTEGER, IN p_SuccessfulValidationCount INTEGER, IN p_FinalValidationPassed BOOLEAN, IN p_ValidationBehavior VARCHAR(50), IN p_RetryStrategy VARCHAR(50), IN p_MaxRetriesConfigured INTEGER, IN p_FinalValidationError VARCHAR(500), IN p_ValidationErrorCount INTEGER, IN p_CommonValidationError VARCHAR(255), IN p_FirstAttemptAt TIMESTAMPTZ, IN p_LastAttemptAt TIMESTAMPTZ, IN p_TotalRetryDurationMS INTEGER, IN p_ValidationAttempts TEXT, IN p_ValidationSummary TEXT, IN p_FailoverAttempts INTEGER, IN p_FailoverErrors TEXT, IN p_FailoverDurations TEXT, IN p_OriginalModelID UUID, IN p_OriginalRequestStartTime TIMESTAMPTZ, IN p_TotalFailoverDuration INTEGER, IN p_RerunFromPromptRunID UUID, IN p_ModelSelection TEXT, IN p_CancellationReason TEXT, IN p_ModelPowerRank INTEGER, IN p_SelectionStrategy VARCHAR(50), IN p_CacheKey VARCHAR(500), IN p_JudgeID UUID, IN p_JudgeScore DOUBLE PRECISION, IN p_FirstTokenTime INTEGER, IN p_ErrorDetails TEXT, IN p_ChildPromptID UUID, IN p_QueueTime INTEGER, IN p_PromptTime INTEGER, IN p_CompletionTime INTEGER, IN p_ModelSpecificResponseDetails TEXT, IN p_EffortLevel INTEGER, IN p_RunName VARCHAR(255), IN p_Comments TEXT, IN p_TestRunID UUID, IN p_ID UUID DEFAULT NULL, IN p_RunAt TIMESTAMPTZ DEFAULT NULL, IN p_Success BOOLEAN DEFAULT NULL, IN p_RunType VARCHAR(20) DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_Cancelled BOOLEAN DEFAULT NULL, IN p_CacheHit BOOLEAN DEFAULT NULL, IN p_WasSelectedResult BOOLEAN DEFAULT NULL, IN p_StreamingEnabled BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIPromptRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPromptRun"
            ("ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID")
        VALUES
            (p_ID, p_PromptID, p_ModelID, p_VendorID, p_AgentID, p_ConfigurationID, p_RunAt, p_CompletedAt, p_ExecutionTimeMS, p_Messages, p_Result, p_TokensUsed, p_TokensPrompt, p_TokensCompletion, p_TotalCost, p_Success, p_ErrorMessage, p_ParentID, p_RunType, p_ExecutionOrder, p_AgentRunID, p_Cost, p_CostCurrency, p_TokensUsedRollup, p_TokensPromptRollup, p_TokensCompletionRollup, p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_ResponseFormat, p_LogProbs, p_TopLogProbs, p_DescendantCost, p_ValidationAttemptCount, p_SuccessfulValidationCount, p_FinalValidationPassed, p_ValidationBehavior, p_RetryStrategy, p_MaxRetriesConfigured, p_FinalValidationError, p_ValidationErrorCount, p_CommonValidationError, p_FirstAttemptAt, p_LastAttemptAt, p_TotalRetryDurationMS, p_ValidationAttempts, p_ValidationSummary, p_FailoverAttempts, p_FailoverErrors, p_FailoverDurations, p_OriginalModelID, p_OriginalRequestStartTime, p_TotalFailoverDuration, p_RerunFromPromptRunID, p_ModelSelection, p_Status, p_Cancelled, p_CancellationReason, p_ModelPowerRank, p_SelectionStrategy, p_CacheHit, p_CacheKey, p_JudgeID, p_JudgeScore, p_WasSelectedResult, p_StreamingEnabled, p_FirstTokenTime, p_ErrorDetails, p_ChildPromptID, p_QueueTime, p_PromptTime, p_CompletionTime, p_ModelSpecificResponseDetails, p_EffortLevel, p_RunName, p_Comments, p_TestRunID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPromptRun"
            ("PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID")
        VALUES
            (p_PromptID, p_ModelID, p_VendorID, p_AgentID, p_ConfigurationID, p_RunAt, p_CompletedAt, p_ExecutionTimeMS, p_Messages, p_Result, p_TokensUsed, p_TokensPrompt, p_TokensCompletion, p_TotalCost, p_Success, p_ErrorMessage, p_ParentID, p_RunType, p_ExecutionOrder, p_AgentRunID, p_Cost, p_CostCurrency, p_TokensUsedRollup, p_TokensPromptRollup, p_TokensCompletionRollup, p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_ResponseFormat, p_LogProbs, p_TopLogProbs, p_DescendantCost, p_ValidationAttemptCount, p_SuccessfulValidationCount, p_FinalValidationPassed, p_ValidationBehavior, p_RetryStrategy, p_MaxRetriesConfigured, p_FinalValidationError, p_ValidationErrorCount, p_CommonValidationError, p_FirstAttemptAt, p_LastAttemptAt, p_TotalRetryDurationMS, p_ValidationAttempts, p_ValidationSummary, p_FailoverAttempts, p_FailoverErrors, p_FailoverDurations, p_OriginalModelID, p_OriginalRequestStartTime, p_TotalFailoverDuration, p_RerunFromPromptRunID, p_ModelSelection, p_Status, p_Cancelled, p_CancellationReason, p_ModelPowerRank, p_SelectionStrategy, p_CacheHit, p_CacheKey, p_JudgeID, p_JudgeScore, p_WasSelectedResult, p_StreamingEnabled, p_FirstTokenTime, p_ErrorDetails, p_ChildPromptID, p_QueueTime, p_PromptTime, p_CompletionTime, p_ModelSpecificResponseDetails, p_EffortLevel, p_RunName, p_Comments, p_TestRunID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentExample"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentExample"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelType"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DefaultInputModalityID UUID, IN p_DefaultOutputModalityID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelType"
            ("ID", "Name", "Description", "DefaultInputModalityID", "DefaultOutputModalityID")
        VALUES
            (p_ID, p_Name, p_Description, p_DefaultInputModalityID, p_DefaultOutputModalityID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelType"
            ("Name", "Description", "DefaultInputModalityID", "DefaultOutputModalityID")
        VALUES
            (p_Name, p_Description, p_DefaultInputModalityID, p_DefaultOutputModalityID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestSuiteTest"(IN p_ID UUID, IN p_SuiteID UUID, IN p_TestID UUID, IN p_Sequence INTEGER, IN p_Status VARCHAR(20), IN p_Configuration TEXT)
RETURNS SETOF __mj."vwTestSuiteTests" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TestSuiteTest"
    SET
        "SuiteID" = p_SuiteID,
        "TestID" = p_TestID,
        "Sequence" = p_Sequence,
        "Status" = p_Status,
        "Configuration" = p_Configuration
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTestSuiteTests" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTemplate"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CategoryID UUID, IN p_UserPrompt TEXT, IN p_UserID UUID, IN p_ActiveAt TIMESTAMPTZ, IN p_DisabledAt TIMESTAMPTZ, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwTemplates" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Template"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "CategoryID" = p_CategoryID,
        "UserPrompt" = p_UserPrompt,
        "UserID" = p_UserID,
        "ActiveAt" = p_ActiveAt,
        "DisabledAt" = p_DisabledAt,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTemplates" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocumentSetting"(IN p_ID UUID, IN p_EntityDocumentID UUID, IN p_Name VARCHAR(100), IN p_Value TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwEntityDocumentSettings" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityDocumentSetting"
    SET
        "EntityDocumentID" = p_EntityDocumentID,
        "Name" = p_Name,
        "Value" = p_Value,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityDocumentSettings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionFilter"(IN p_UserDescription TEXT, IN p_UserComments TEXT, IN p_Code TEXT, IN p_CodeExplanation TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwActionFilters" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionFilter"
            ("ID", "UserDescription", "UserComments", "Code", "CodeExplanation")
        VALUES
            (p_ID, p_UserDescription, p_UserComments, p_Code, p_CodeExplanation)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionFilter"
            ("UserDescription", "UserComments", "Code", "CodeExplanation")
        VALUES
            (p_UserDescription, p_UserComments, p_Code, p_CodeExplanation)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionFilters" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailArtifact"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ConversationDetailArtifact"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetail"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ConversationDetail"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueueTask"(IN p_QueueID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Data TEXT, IN p_Options TEXT, IN p_Output TEXT, IN p_ErrorMessage TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status CHAR(10) DEFAULT NULL)
RETURNS SETOF __mj."vwQueueTasks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueueTask"
            ("ID", "QueueID", "Status", "StartedAt", "EndedAt", "Data", "Options", "Output", "ErrorMessage", "Comments")
        VALUES
            (p_ID, p_QueueID, p_Status, p_StartedAt, p_EndedAt, p_Data, p_Options, p_Output, p_ErrorMessage, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueueTask"
            ("QueueID", "Status", "StartedAt", "EndedAt", "Data", "Options", "Output", "ErrorMessage", "Comments")
        VALUES
            (p_QueueID, p_Status, p_StartedAt, p_EndedAt, p_Data, p_Options, p_Output, p_ErrorMessage, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueueTasks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQuery"(IN p_Name VARCHAR(255), IN p_CategoryID UUID, IN p_UserQuestion TEXT, IN p_Description TEXT, IN p_SQL TEXT, IN p_TechnicalDescription TEXT, IN p_OriginalSQL TEXT, IN p_Feedback TEXT, IN p_QualityRank INTEGER, IN p_ExecutionCostRank INTEGER, IN p_UsesTemplate BOOLEAN, IN p_CacheTTLMinutes INTEGER, IN p_CacheMaxSize INTEGER, IN p_EmbeddingVector TEXT, IN p_EmbeddingModelID UUID, IN p_CacheValidationSQL TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(15) DEFAULT NULL, IN p_AuditQueryRuns BOOLEAN DEFAULT NULL, IN p_CacheEnabled BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwQueries" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Query"
            ("ID", "Name", "CategoryID", "UserQuestion", "Description", "SQL", "TechnicalDescription", "OriginalSQL", "Feedback", "Status", "QualityRank", "ExecutionCostRank", "UsesTemplate", "AuditQueryRuns", "CacheEnabled", "CacheTTLMinutes", "CacheMaxSize", "EmbeddingVector", "EmbeddingModelID", "CacheValidationSQL")
        VALUES
            (p_ID, p_Name, p_CategoryID, p_UserQuestion, p_Description, p_SQL, p_TechnicalDescription, p_OriginalSQL, p_Feedback, p_Status, p_QualityRank, p_ExecutionCostRank, p_UsesTemplate, p_AuditQueryRuns, p_CacheEnabled, p_CacheTTLMinutes, p_CacheMaxSize, p_EmbeddingVector, p_EmbeddingModelID, p_CacheValidationSQL)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Query"
            ("Name", "CategoryID", "UserQuestion", "Description", "SQL", "TechnicalDescription", "OriginalSQL", "Feedback", "Status", "QualityRank", "ExecutionCostRank", "UsesTemplate", "AuditQueryRuns", "CacheEnabled", "CacheTTLMinutes", "CacheMaxSize", "EmbeddingVector", "EmbeddingModelID", "CacheValidationSQL")
        VALUES
            (p_Name, p_CategoryID, p_UserQuestion, p_Description, p_SQL, p_TechnicalDescription, p_OriginalSQL, p_Feedback, p_Status, p_QualityRank, p_ExecutionCostRank, p_UsesTemplate, p_AuditQueryRuns, p_CacheEnabled, p_CacheTTLMinutes, p_CacheMaxSize, p_EmbeddingVector, p_EmbeddingModelID, p_CacheValidationSQL)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTag"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_ParentID UUID, IN p_DisplayName VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwTags" AS $$
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
$$ LANGUAGE plpgsql;

-- SKIPPED utility procedure: spUpdateSchemaInfoFromDatabase (needs manual rewrite for PostgreSQL)

CREATE OR REPLACE FUNCTION __mj."spDeleteConversation"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Conversation"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocumentRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityDocumentRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteComponentDependency"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ComponentDependency"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAccessControlRule"(IN p_EntityID UUID, IN p_RecordID VARCHAR(500), IN p_GranteeType VARCHAR(50), IN p_GranteeID UUID, IN p_ExpiresAt TIMESTAMPTZ, IN p_GrantedByUserID UUID, IN p_ID UUID DEFAULT NULL, IN p_CanRead BOOLEAN DEFAULT NULL, IN p_CanCreate BOOLEAN DEFAULT NULL, IN p_CanUpdate BOOLEAN DEFAULT NULL, IN p_CanDelete BOOLEAN DEFAULT NULL, IN p_CanShare BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAccessControlRules" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AccessControlRule"
            ("ID", "EntityID", "RecordID", "GranteeType", "GranteeID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "CanShare", "ExpiresAt", "GrantedByUserID")
        VALUES
            (p_ID, p_EntityID, p_RecordID, p_GranteeType, p_GranteeID, p_CanRead, p_CanCreate, p_CanUpdate, p_CanDelete, p_CanShare, p_ExpiresAt, p_GrantedByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AccessControlRule"
            ("EntityID", "RecordID", "GranteeType", "GranteeID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "CanShare", "ExpiresAt", "GrantedByUserID")
        VALUES
            (p_EntityID, p_RecordID, p_GranteeType, p_GranteeID, p_CanRead, p_CanCreate, p_CanUpdate, p_CanDelete, p_CanShare, p_ExpiresAt, p_GrantedByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAccessControlRules" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateVersionLabel"(IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_EntityID UUID, IN p_RecordID VARCHAR(750), IN p_ParentID UUID, IN p_CreatedByUserID UUID, IN p_ExternalSystemID VARCHAR(200), IN p_ID UUID DEFAULT NULL, IN p_Scope VARCHAR(50) DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_ItemCount INTEGER DEFAULT NULL, IN p_CreationDurationMS INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwVersionLabels" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."VersionLabel"
            ("ID", "Name", "Description", "Scope", "EntityID", "RecordID", "ParentID", "Status", "CreatedByUserID", "ExternalSystemID", "ItemCount", "CreationDurationMS")
        VALUES
            (p_ID, p_Name, p_Description, p_Scope, p_EntityID, p_RecordID, p_ParentID, p_Status, p_CreatedByUserID, p_ExternalSystemID, p_ItemCount, p_CreationDurationMS)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."VersionLabel"
            ("Name", "Description", "Scope", "EntityID", "RecordID", "ParentID", "Status", "CreatedByUserID", "ExternalSystemID", "ItemCount", "CreationDurationMS")
        VALUES
            (p_Name, p_Description, p_Scope, p_EntityID, p_RecordID, p_ParentID, p_Status, p_CreatedByUserID, p_ExternalSystemID, p_ItemCount, p_CreationDurationMS)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwVersionLabels" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCredential"(IN p_ID UUID, IN p_CredentialTypeID UUID, IN p_CategoryID UUID, IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_Values TEXT, IN p_IsDefault BOOLEAN, IN p_IsActive BOOLEAN, IN p_ExpiresAt TIMESTAMPTZ, IN p_LastValidatedAt TIMESTAMPTZ, IN p_LastUsedAt TIMESTAMPTZ, IN p_IconClass VARCHAR(100))
RETURNS SETOF __mj."vwCredentials" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Credential"
    SET
        "CredentialTypeID" = p_CredentialTypeID,
        "CategoryID" = p_CategoryID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Values" = p_Values,
        "IsDefault" = p_IsDefault,
        "IsActive" = p_IsActive,
        "ExpiresAt" = p_ExpiresAt,
        "LastValidatedAt" = p_LastValidatedAt,
        "LastUsedAt" = p_LastUsedAt,
        "IconClass" = p_IconClass
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCredentials" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailArtifact"(IN p_ID UUID, IN p_ConversationDetailID UUID, IN p_ArtifactVersionID UUID, IN p_Direction VARCHAR(20))
RETURNS SETOF __mj."vwConversationDetailArtifacts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ConversationDetailArtifact"
    SET
        "ConversationDetailID" = p_ConversationDetailID,
        "ArtifactVersionID" = p_ArtifactVersionID,
        "Direction" = p_Direction
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNoteType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentNoteTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentNoteType"
            ("ID", "Name", "Description", "Priority", "Status")
        VALUES
            (p_ID, p_Name, p_Description, p_Priority, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentNoteType"
            ("Name", "Description", "Priority", "Status")
        VALUES
            (p_Name, p_Description, p_Priority, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentNoteTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemTag"(IN p_ItemID UUID, IN p_Tag VARCHAR(200), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentItemTags" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentItemTag"
            ("ID", "ItemID", "Tag")
        VALUES
            (p_ID, p_ItemID, p_Tag)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentItemTag"
            ("ItemID", "Tag")
        VALUES
            (p_ItemID, p_Tag)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateOutputTriggerType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwOutputTriggerTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."OutputTriggerType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwOutputTriggerTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionAuthorization"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionAuthorization"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboard"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Dashboard"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVersionLabel"(IN p_ID UUID, IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_Scope VARCHAR(50), IN p_EntityID UUID, IN p_RecordID VARCHAR(750), IN p_ParentID UUID, IN p_Status VARCHAR(50), IN p_CreatedByUserID UUID, IN p_ExternalSystemID VARCHAR(200), IN p_ItemCount INTEGER, IN p_CreationDurationMS INTEGER)
RETURNS SETOF __mj."vwVersionLabels" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAction"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DefaultPrompt TEXT, IN p_DefaultModelID UUID, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIActions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAction"
            ("ID", "Name", "Description", "DefaultPrompt", "DefaultModelID", "IsActive")
        VALUES
            (p_ID, p_Name, p_Description, p_DefaultPrompt, p_DefaultModelID, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAction"
            ("Name", "Description", "DefaultPrompt", "DefaultModelID", "IsActive")
        VALUES
            (p_Name, p_Description, p_DefaultPrompt, p_DefaultModelID, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIActions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteSchemaInfo"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."SchemaInfo"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIArchitecture"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Category VARCHAR(50), IN p_ParentArchitectureID UUID, IN p_WikipediaURL VARCHAR(500), IN p_YearIntroduced INTEGER, IN p_KeyPaper VARCHAR(500))
RETURNS SETOF __mj."vwAIArchitectures" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCommunicationRun"(IN p_UserID UUID, IN p_Direction VARCHAR(20), IN p_Status VARCHAR(20), IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Comments TEXT, IN p_ErrorMessage TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwCommunicationRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CommunicationRun"
            ("ID", "UserID", "Direction", "Status", "StartedAt", "EndedAt", "Comments", "ErrorMessage")
        VALUES
            (p_ID, p_UserID, p_Direction, p_Status, p_StartedAt, p_EndedAt, p_Comments, p_ErrorMessage)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CommunicationRun"
            ("UserID", "Direction", "Status", "StartedAt", "EndedAt", "Comments", "ErrorMessage")
        VALUES
            (p_UserID, p_Direction, p_Status, p_StartedAt, p_EndedAt, p_Comments, p_ErrorMessage)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteWorkflow"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Workflow"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserViewRun"(IN p_ID UUID, IN p_UserViewID UUID, IN p_RunAt TIMESTAMPTZ, IN p_RunByUserID UUID)
RETURNS SETOF __mj."vwUserViewRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserViewRun"
    SET
        "UserViewID" = p_UserViewID,
        "RunAt" = p_RunAt,
        "RunByUserID" = p_RunByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserViewRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdatePublicLink"(IN p_ID UUID, IN p_ResourceType VARCHAR(50), IN p_ResourceID UUID, IN p_Token VARCHAR(255), IN p_PasswordHash VARCHAR(255), IN p_ExpiresAt TIMESTAMPTZ, IN p_MaxViews INTEGER, IN p_CurrentViews INTEGER, IN p_UserID UUID, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwPublicLinks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."PublicLink"
    SET
        "ResourceType" = p_ResourceType,
        "ResourceID" = p_ResourceID,
        "Token" = p_Token,
        "PasswordHash" = p_PasswordHash,
        "ExpiresAt" = p_ExpiresAt,
        "MaxViews" = p_MaxViews,
        "CurrentViews" = p_CurrentViews,
        "UserID" = p_UserID,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwPublicLinks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordMergeDeletionLog"(IN p_ID UUID, IN p_RecordMergeLogID UUID, IN p_DeletedRecordID VARCHAR(750), IN p_Status VARCHAR(10), IN p_ProcessingLog TEXT)
RETURNS SETOF __mj."vwRecordMergeDeletionLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecordMergeDeletionLog"
    SET
        "RecordMergeLogID" = p_RecordMergeLogID,
        "DeletedRecordID" = p_DeletedRecordID,
        "Status" = p_Status,
        "ProcessingLog" = p_ProcessingLog
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecordMergeDeletionLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAuditLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AuditLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelPriceType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelPriceTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelPriceType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelPriceType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelPriceTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_LogoURL VARCHAR(255), IN p_ParentID UUID, IN p_ContextCompressionMessageThreshold INTEGER, IN p_ContextCompressionPromptID UUID, IN p_ContextCompressionMessageRetentionCount INTEGER, IN p_TypeID UUID, IN p_DriverClass VARCHAR(255), IN p_IconClass VARCHAR(100), IN p_PayloadSelfReadPaths TEXT, IN p_PayloadSelfWritePaths TEXT, IN p_PayloadScope TEXT, IN p_FinalPayloadValidation TEXT, IN p_MaxCostPerRun NUMERIC(10,4), IN p_MaxTokensPerRun INTEGER, IN p_MaxIterationsPerRun INTEGER, IN p_MaxTimePerRun INTEGER, IN p_MinExecutionsPerRun INTEGER, IN p_MaxExecutionsPerRun INTEGER, IN p_StartingPayloadValidation TEXT, IN p_DefaultPromptEffortLevel INTEGER, IN p_ChatHandlingOption VARCHAR(30), IN p_DefaultArtifactTypeID UUID, IN p_FunctionalRequirements TEXT, IN p_TechnicalDesign TEXT, IN p_MaxMessages INTEGER, IN p_AttachmentStorageProviderID UUID, IN p_AttachmentRootPath VARCHAR(500), IN p_InlineStorageThresholdBytes INTEGER, IN p_AgentTypePromptParams TEXT, IN p_ScopeConfig TEXT, IN p_NoteRetentionDays INTEGER, IN p_ExampleRetentionDays INTEGER, IN p_RerankerConfiguration TEXT, IN p_ID UUID DEFAULT NULL, IN p_ExposeAsAction BOOLEAN DEFAULT NULL, IN p_ExecutionOrder INTEGER DEFAULT NULL, IN p_ExecutionMode VARCHAR(20) DEFAULT NULL, IN p_EnableContextCompression BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_ModelSelectionMode VARCHAR(50) DEFAULT NULL, IN p_PayloadDownstreamPaths TEXT DEFAULT NULL, IN p_PayloadUpstreamPaths TEXT DEFAULT NULL, IN p_FinalPayloadValidationMode VARCHAR(25) DEFAULT NULL, IN p_FinalPayloadValidationMaxRetries INTEGER DEFAULT NULL, IN p_StartingPayloadValidationMode VARCHAR(25) DEFAULT NULL, IN p_OwnerUserID UUID DEFAULT NULL, IN p_InvocationMode VARCHAR(20) DEFAULT NULL, IN p_ArtifactCreationMode VARCHAR(20) DEFAULT NULL, IN p_InjectNotes BOOLEAN DEFAULT NULL, IN p_MaxNotesToInject INTEGER DEFAULT NULL, IN p_NoteInjectionStrategy VARCHAR(20) DEFAULT NULL, IN p_InjectExamples BOOLEAN DEFAULT NULL, IN p_MaxExamplesToInject INTEGER DEFAULT NULL, IN p_ExampleInjectionStrategy VARCHAR(20) DEFAULT NULL, IN p_IsRestricted BOOLEAN DEFAULT NULL, IN p_MessageMode VARCHAR(50) DEFAULT NULL, IN p_AutoArchiveEnabled BOOLEAN DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgent"
            ("ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration")
        VALUES
            (p_ID, p_Name, p_Description, p_LogoURL, p_ParentID, p_ExposeAsAction, p_ExecutionOrder, p_ExecutionMode, p_EnableContextCompression, p_ContextCompressionMessageThreshold, p_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount, p_TypeID, p_Status, p_DriverClass, p_IconClass, p_ModelSelectionMode, p_PayloadDownstreamPaths, p_PayloadUpstreamPaths, p_PayloadSelfReadPaths, p_PayloadSelfWritePaths, p_PayloadScope, p_FinalPayloadValidation, p_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries, p_MaxCostPerRun, p_MaxTokensPerRun, p_MaxIterationsPerRun, p_MaxTimePerRun, p_MinExecutionsPerRun, p_MaxExecutionsPerRun, p_StartingPayloadValidation, p_StartingPayloadValidationMode, p_DefaultPromptEffortLevel, p_ChatHandlingOption, p_DefaultArtifactTypeID, p_OwnerUserID, p_InvocationMode, p_ArtifactCreationMode, p_FunctionalRequirements, p_TechnicalDesign, p_InjectNotes, p_MaxNotesToInject, p_NoteInjectionStrategy, p_InjectExamples, p_MaxExamplesToInject, p_ExampleInjectionStrategy, p_IsRestricted, p_MessageMode, p_MaxMessages, p_AttachmentStorageProviderID, p_AttachmentRootPath, p_InlineStorageThresholdBytes, p_AgentTypePromptParams, p_ScopeConfig, p_NoteRetentionDays, p_ExampleRetentionDays, p_AutoArchiveEnabled, p_RerankerConfiguration)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgent" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionCategory"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ParentID UUID, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwActionCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEncryptionKey"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EncryptionKey"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVersionLabel"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."VersionLabel"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRole"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Role"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteExplorerNavigationItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ExplorerNavigationItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_LogoURL VARCHAR(255), IN p_ParentID UUID, IN p_ExposeAsAction BOOLEAN, IN p_ExecutionOrder INTEGER, IN p_ExecutionMode VARCHAR(20), IN p_EnableContextCompression BOOLEAN, IN p_ContextCompressionMessageThreshold INTEGER, IN p_ContextCompressionPromptID UUID, IN p_ContextCompressionMessageRetentionCount INTEGER, IN p_TypeID UUID, IN p_Status VARCHAR(20), IN p_DriverClass VARCHAR(255), IN p_IconClass VARCHAR(100), IN p_ModelSelectionMode VARCHAR(50), IN p_PayloadDownstreamPaths TEXT, IN p_PayloadUpstreamPaths TEXT, IN p_PayloadSelfReadPaths TEXT, IN p_PayloadSelfWritePaths TEXT, IN p_PayloadScope TEXT, IN p_FinalPayloadValidation TEXT, IN p_FinalPayloadValidationMode VARCHAR(25), IN p_FinalPayloadValidationMaxRetries INTEGER, IN p_MaxCostPerRun NUMERIC(10,4), IN p_MaxTokensPerRun INTEGER, IN p_MaxIterationsPerRun INTEGER, IN p_MaxTimePerRun INTEGER, IN p_MinExecutionsPerRun INTEGER, IN p_MaxExecutionsPerRun INTEGER, IN p_StartingPayloadValidation TEXT, IN p_StartingPayloadValidationMode VARCHAR(25), IN p_DefaultPromptEffortLevel INTEGER, IN p_ChatHandlingOption VARCHAR(30), IN p_DefaultArtifactTypeID UUID, IN p_OwnerUserID UUID, IN p_InvocationMode VARCHAR(20), IN p_ArtifactCreationMode VARCHAR(20), IN p_FunctionalRequirements TEXT, IN p_TechnicalDesign TEXT, IN p_InjectNotes BOOLEAN, IN p_MaxNotesToInject INTEGER, IN p_NoteInjectionStrategy VARCHAR(20), IN p_InjectExamples BOOLEAN, IN p_MaxExamplesToInject INTEGER, IN p_ExampleInjectionStrategy VARCHAR(20), IN p_IsRestricted BOOLEAN, IN p_MessageMode VARCHAR(50), IN p_MaxMessages INTEGER, IN p_AttachmentStorageProviderID UUID, IN p_AttachmentRootPath VARCHAR(500), IN p_InlineStorageThresholdBytes INTEGER, IN p_AgentTypePromptParams TEXT, IN p_ScopeConfig TEXT, IN p_NoteRetentionDays INTEGER, IN p_ExampleRetentionDays INTEGER, IN p_AutoArchiveEnabled BOOLEAN, IN p_RerankerConfiguration TEXT)
RETURNS SETOF __mj."vwAIAgents" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTaskDependency"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TaskDependency"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateResourceType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_DisplayName VARCHAR(255), IN p_Description TEXT, IN p_Icon VARCHAR(100), IN p_EntityID UUID, IN p_CategoryEntityID UUID, IN p_DriverClass VARCHAR(255))
RETURNS SETOF __mj."vwResourceTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ResourceType"
    SET
        "Name" = p_Name,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "Icon" = p_Icon,
        "EntityID" = p_EntityID,
        "CategoryEntityID" = p_CategoryEntityID,
        "DriverClass" = p_DriverClass
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwResourceTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTaskDependency"(IN p_TaskID UUID, IN p_DependsOnTaskID UUID, IN p_ID UUID DEFAULT NULL, IN p_DependencyType VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwTaskDependencies" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TaskDependency"
            ("ID", "TaskID", "DependsOnTaskID", "DependencyType")
        VALUES
            (p_ID, p_TaskID, p_DependsOnTaskID, p_DependencyType)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TaskDependency"
            ("TaskID", "DependsOnTaskID", "DependencyType")
        VALUES
            (p_TaskID, p_DependsOnTaskID, p_DependencyType)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelArchitecture"(IN p_ID UUID, IN p_ModelID UUID, IN p_ArchitectureID UUID, IN p_Rank INTEGER, IN p_Weight NUMERIC(5,4), IN p_Notes VARCHAR(500))
RETURNS SETOF __mj."vwAIModelArchitectures" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelArchitecture"
    SET
        "ModelID" = p_ModelID,
        "ArchitectureID" = p_ArchitectureID,
        "Rank" = p_Rank,
        "Weight" = p_Weight,
        "Notes" = p_Notes
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelArchitectures" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserView"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserView"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentSourceType"(IN p_Name VARCHAR(255), IN p_Description VARCHAR(1000), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentSourceTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentSourceType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentSourceType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentSourceTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionInvocation"(IN p_ID UUID, IN p_EntityActionID UUID, IN p_InvocationTypeID UUID, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwEntityActionInvocations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityActionInvocation"
    SET
        "EntityActionID" = p_EntityActionID,
        "InvocationTypeID" = p_InvocationTypeID,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityAction"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityAction"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteComponentLibrary"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ComponentLibrary"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserFavorite"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserFavorite"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemAttribute"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentItemAttribute"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIConfigurationParam"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIConfigurationParam"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateScheduledJob"(IN p_JobTypeID UUID, IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_CronExpression VARCHAR(120), IN p_StartAt TIMESTAMPTZ, IN p_EndAt TIMESTAMPTZ, IN p_Configuration TEXT, IN p_OwnerUserID UUID, IN p_LastRunAt TIMESTAMPTZ, IN p_NextRunAt TIMESTAMPTZ, IN p_NotifyUserID UUID, IN p_LockToken UUID, IN p_LockedAt TIMESTAMPTZ, IN p_LockedByInstance VARCHAR(255), IN p_ExpectedCompletionAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_Timezone VARCHAR(64) DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_RunCount INTEGER DEFAULT NULL, IN p_SuccessCount INTEGER DEFAULT NULL, IN p_FailureCount INTEGER DEFAULT NULL, IN p_NotifyOnSuccess BOOLEAN DEFAULT NULL, IN p_NotifyOnFailure BOOLEAN DEFAULT NULL, IN p_NotifyViaEmail BOOLEAN DEFAULT NULL, IN p_NotifyViaInApp BOOLEAN DEFAULT NULL, IN p_ConcurrencyMode VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwScheduledJobs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ScheduledJob"
            ("ID", "JobTypeID", "Name", "Description", "CronExpression", "Timezone", "StartAt", "EndAt", "Status", "Configuration", "OwnerUserID", "LastRunAt", "NextRunAt", "RunCount", "SuccessCount", "FailureCount", "NotifyOnSuccess", "NotifyOnFailure", "NotifyUserID", "NotifyViaEmail", "NotifyViaInApp", "LockToken", "LockedAt", "LockedByInstance", "ExpectedCompletionAt", "ConcurrencyMode")
        VALUES
            (p_ID, p_JobTypeID, p_Name, p_Description, p_CronExpression, p_Timezone, p_StartAt, p_EndAt, p_Status, p_Configuration, p_OwnerUserID, p_LastRunAt, p_NextRunAt, p_RunCount, p_SuccessCount, p_FailureCount, p_NotifyOnSuccess, p_NotifyOnFailure, p_NotifyUserID, p_NotifyViaEmail, p_NotifyViaInApp, p_LockToken, p_LockedAt, p_LockedByInstance, p_ExpectedCompletionAt, p_ConcurrencyMode)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ScheduledJob"
            ("JobTypeID", "Name", "Description", "CronExpression", "Timezone", "StartAt", "EndAt", "Status", "Configuration", "OwnerUserID", "LastRunAt", "NextRunAt", "RunCount", "SuccessCount", "FailureCount", "NotifyOnSuccess", "NotifyOnFailure", "NotifyUserID", "NotifyViaEmail", "NotifyViaInApp", "LockToken", "LockedAt", "LockedByInstance", "ExpectedCompletionAt", "ConcurrencyMode")
        VALUES
            (p_JobTypeID, p_Name, p_Description, p_CronExpression, p_Timezone, p_StartAt, p_EndAt, p_Status, p_Configuration, p_OwnerUserID, p_LastRunAt, p_NextRunAt, p_RunCount, p_SuccessCount, p_FailureCount, p_NotifyOnSuccess, p_NotifyOnFailure, p_NotifyUserID, p_NotifyViaEmail, p_NotifyViaInApp, p_LockToken, p_LockedAt, p_LockedByInstance, p_ExpectedCompletionAt, p_ConcurrencyMode)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwScheduledJobs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(IN p_ID UUID, IN p_PromptID UUID, IN p_ModelID UUID, IN p_VendorID UUID, IN p_AgentID UUID, IN p_ConfigurationID UUID, IN p_RunAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_ExecutionTimeMS INTEGER, IN p_Messages TEXT, IN p_Result TEXT, IN p_TokensUsed INTEGER, IN p_TokensPrompt INTEGER, IN p_TokensCompletion INTEGER, IN p_TotalCost NUMERIC(18,6), IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_ParentID UUID, IN p_RunType VARCHAR(20), IN p_ExecutionOrder INTEGER, IN p_AgentRunID UUID, IN p_Cost NUMERIC(19,8), IN p_CostCurrency VARCHAR(10), IN p_TokensUsedRollup INTEGER, IN p_TokensPromptRollup INTEGER, IN p_TokensCompletionRollup INTEGER, IN p_Temperature NUMERIC(3,2), IN p_TopP NUMERIC(3,2), IN p_TopK INTEGER, IN p_MinP NUMERIC(3,2), IN p_FrequencyPenalty NUMERIC(3,2), IN p_PresencePenalty NUMERIC(3,2), IN p_Seed INTEGER, IN p_StopSequences TEXT, IN p_ResponseFormat VARCHAR(50), IN p_LogProbs BOOLEAN, IN p_TopLogProbs INTEGER, IN p_DescendantCost NUMERIC(18,6), IN p_ValidationAttemptCount INTEGER, IN p_SuccessfulValidationCount INTEGER, IN p_FinalValidationPassed BOOLEAN, IN p_ValidationBehavior VARCHAR(50), IN p_RetryStrategy VARCHAR(50), IN p_MaxRetriesConfigured INTEGER, IN p_FinalValidationError VARCHAR(500), IN p_ValidationErrorCount INTEGER, IN p_CommonValidationError VARCHAR(255), IN p_FirstAttemptAt TIMESTAMPTZ, IN p_LastAttemptAt TIMESTAMPTZ, IN p_TotalRetryDurationMS INTEGER, IN p_ValidationAttempts TEXT, IN p_ValidationSummary TEXT, IN p_FailoverAttempts INTEGER, IN p_FailoverErrors TEXT, IN p_FailoverDurations TEXT, IN p_OriginalModelID UUID, IN p_OriginalRequestStartTime TIMESTAMPTZ, IN p_TotalFailoverDuration INTEGER, IN p_RerunFromPromptRunID UUID, IN p_ModelSelection TEXT, IN p_Status VARCHAR(50), IN p_Cancelled BOOLEAN, IN p_CancellationReason TEXT, IN p_ModelPowerRank INTEGER, IN p_SelectionStrategy VARCHAR(50), IN p_CacheHit BOOLEAN, IN p_CacheKey VARCHAR(500), IN p_JudgeID UUID, IN p_JudgeScore DOUBLE PRECISION, IN p_WasSelectedResult BOOLEAN, IN p_StreamingEnabled BOOLEAN, IN p_FirstTokenTime INTEGER, IN p_ErrorDetails TEXT, IN p_ChildPromptID UUID, IN p_QueueTime INTEGER, IN p_PromptTime INTEGER, IN p_CompletionTime INTEGER, IN p_ModelSpecificResponseDetails TEXT, IN p_EffortLevel INTEGER, IN p_RunName VARCHAR(255), IN p_Comments TEXT, IN p_TestRunID UUID)
RETURNS SETOF __mj."vwAIPromptRuns" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgent"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelType"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DefaultInputModalityID UUID, IN p_DefaultOutputModalityID UUID)
RETURNS SETOF __mj."vwAIModelTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DefaultInputModalityID" = p_DefaultInputModalityID,
        "DefaultOutputModalityID" = p_DefaultOutputModalityID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestSuiteTest"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TestSuiteTest"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAccessControlRule"(IN p_ID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(500), IN p_GranteeType VARCHAR(50), IN p_GranteeID UUID, IN p_CanRead BOOLEAN, IN p_CanCreate BOOLEAN, IN p_CanUpdate BOOLEAN, IN p_CanDelete BOOLEAN, IN p_CanShare BOOLEAN, IN p_ExpiresAt TIMESTAMPTZ, IN p_GrantedByUserID UUID)
RETURNS SETOF __mj."vwAccessControlRules" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AccessControlRule"
    SET
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "GranteeType" = p_GranteeType,
        "GranteeID" = p_GranteeID,
        "CanRead" = p_CanRead,
        "CanCreate" = p_CanCreate,
        "CanUpdate" = p_CanUpdate,
        "CanDelete" = p_CanDelete,
        "CanShare" = p_CanShare,
        "ExpiresAt" = p_ExpiresAt,
        "GrantedByUserID" = p_GrantedByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAccessControlRules" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRunDetail"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CompanyIntegrationRunDetail"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateFileCategory"(IN p_Name VARCHAR(255), IN p_ParentID UUID, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwFileCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQuery"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_CategoryID UUID, IN p_UserQuestion TEXT, IN p_Description TEXT, IN p_SQL TEXT, IN p_TechnicalDescription TEXT, IN p_OriginalSQL TEXT, IN p_Feedback TEXT, IN p_Status VARCHAR(15), IN p_QualityRank INTEGER, IN p_ExecutionCostRank INTEGER, IN p_UsesTemplate BOOLEAN, IN p_AuditQueryRuns BOOLEAN, IN p_CacheEnabled BOOLEAN, IN p_CacheTTLMinutes INTEGER, IN p_CacheMaxSize INTEGER, IN p_EmbeddingVector TEXT, IN p_EmbeddingModelID UUID, IN p_CacheValidationSQL TEXT)
RETURNS SETOF __mj."vwQueries" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Query"
    SET
        "Name" = p_Name,
        "CategoryID" = p_CategoryID,
        "UserQuestion" = p_UserQuestion,
        "Description" = p_Description,
        "SQL" = p_SQL,
        "TechnicalDescription" = p_TechnicalDescription,
        "OriginalSQL" = p_OriginalSQL,
        "Feedback" = p_Feedback,
        "Status" = p_Status,
        "QualityRank" = p_QualityRank,
        "ExecutionCostRank" = p_ExecutionCostRank,
        "UsesTemplate" = p_UsesTemplate,
        "AuditQueryRuns" = p_AuditQueryRuns,
        "CacheEnabled" = p_CacheEnabled,
        "CacheTTLMinutes" = p_CacheTTLMinutes,
        "CacheMaxSize" = p_CacheMaxSize,
        "EmbeddingVector" = p_EmbeddingVector,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "CacheValidationSQL" = p_CacheValidationSQL
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionFilter"(IN p_ID UUID, IN p_UserDescription TEXT, IN p_UserComments TEXT, IN p_Code TEXT, IN p_CodeExplanation TEXT)
RETURNS SETOF __mj."vwActionFilters" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionFilter"
    SET
        "UserDescription" = p_UserDescription,
        "UserComments" = p_UserComments,
        "Code" = p_Code,
        "CodeExplanation" = p_CodeExplanation
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionFilters" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateWorkspaceItem"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_WorkspaceID UUID, IN p_ResourceTypeID UUID, IN p_ResourceRecordID VARCHAR(2000), IN p_Sequence INTEGER, IN p_Configuration TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwWorkspaceItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."WorkspaceItem"
            ("ID", "Name", "Description", "WorkspaceID", "ResourceTypeID", "ResourceRecordID", "Sequence", "Configuration")
        VALUES
            (p_ID, p_Name, p_Description, p_WorkspaceID, p_ResourceTypeID, p_ResourceRecordID, p_Sequence, p_Configuration)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."WorkspaceItem"
            ("Name", "Description", "WorkspaceID", "ResourceTypeID", "ResourceRecordID", "Sequence", "Configuration")
        VALUES
            (p_Name, p_Description, p_WorkspaceID, p_ResourceTypeID, p_ResourceRecordID, p_Sequence, p_Configuration)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwWorkspaceItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelAction"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelAction"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEmployee"(IN p_FirstName VARCHAR(30), IN p_LastName VARCHAR(50), IN p_CompanyID UUID, IN p_SupervisorID UUID, IN p_Title VARCHAR(50), IN p_Email VARCHAR(100), IN p_Phone VARCHAR(20), IN p_ID UUID DEFAULT NULL, IN p_Active BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEmployees" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Employee"
            ("ID", "FirstName", "LastName", "CompanyID", "SupervisorID", "Title", "Email", "Phone", "Active")
        VALUES
            (p_ID, p_FirstName, p_LastName, p_CompanyID, p_SupervisorID, p_Title, p_Email, p_Phone, p_Active)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Employee"
            ("FirstName", "LastName", "CompanyID", "SupervisorID", "Title", "Email", "Phone", "Active")
        VALUES
            (p_FirstName, p_LastName, p_CompanyID, p_SupervisorID, p_Title, p_Email, p_Phone, p_Active)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEmployees" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDataContext"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DataContext"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCredential"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Credential"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueueType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."QueueType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNoteType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Priority INTEGER, IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwAIAgentNoteTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentNoteType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentNoteTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueueTask"(IN p_ID UUID, IN p_QueueID UUID, IN p_Status CHAR(10), IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Data TEXT, IN p_Options TEXT, IN p_Output TEXT, IN p_ErrorMessage TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwQueueTasks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."QueueTask"
    SET
        "QueueID" = p_QueueID,
        "Status" = p_Status,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Data" = p_Data,
        "Options" = p_Options,
        "Output" = p_Output,
        "ErrorMessage" = p_ErrorMessage,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueueTasks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTaskDependency"(IN p_ID UUID, IN p_TaskID UUID, IN p_DependsOnTaskID UUID, IN p_DependencyType VARCHAR(50))
RETURNS SETOF __mj."vwTaskDependencies" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TaskDependency"
    SET
        "TaskID" = p_TaskID,
        "DependsOnTaskID" = p_DependsOnTaskID,
        "DependencyType" = p_DependencyType
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAction"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DefaultPrompt TEXT, IN p_DefaultModelID UUID, IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwAIActions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAction"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DefaultPrompt" = p_DefaultPrompt,
        "DefaultModelID" = p_DefaultModelID,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIActions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestRunFeedback"(IN p_TestRunID UUID, IN p_ReviewerUserID UUID, IN p_Rating INTEGER, IN p_IsCorrect BOOLEAN, IN p_CorrectionSummary TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_ReviewedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwTestRunFeedbacks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestRunFeedback"
            ("ID", "TestRunID", "ReviewerUserID", "Rating", "IsCorrect", "CorrectionSummary", "Comments", "ReviewedAt")
        VALUES
            (p_ID, p_TestRunID, p_ReviewerUserID, p_Rating, p_IsCorrect, p_CorrectionSummary, p_Comments, p_ReviewedAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestRunFeedback"
            ("TestRunID", "ReviewerUserID", "Rating", "IsCorrect", "CorrectionSummary", "Comments", "ReviewedAt")
        VALUES
            (p_TestRunID, p_ReviewerUserID, p_Rating, p_IsCorrect, p_CorrectionSummary, p_Comments, p_ReviewedAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestRunFeedbacks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemTag"(IN p_ID UUID, IN p_ItemID UUID, IN p_Tag VARCHAR(200))
RETURNS SETOF __mj."vwContentItemTags" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentItemTag"
    SET
        "ItemID" = p_ItemID,
        "Tag" = p_Tag
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityFieldValue"(IN p_EntityFieldID UUID, IN p_Sequence INTEGER, IN p_Value VARCHAR(255), IN p_Code VARCHAR(50), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityFieldValues" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteComponentLibraryLink"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ComponentLibraryLink"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTemplateParam"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TemplateParam"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelCost"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelCost"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationURLFormat"(IN p_IntegrationID UUID, IN p_EntityID UUID, IN p_URLFormat VARCHAR(500), IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwIntegrationURLFormats" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."IntegrationURLFormat"
            ("ID", "IntegrationID", "EntityID", "URLFormat", "Comments")
        VALUES
            (p_ID, p_IntegrationID, p_EntityID, p_URLFormat, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."IntegrationURLFormat"
            ("IntegrationID", "EntityID", "URLFormat", "Comments")
        VALUES
            (p_IntegrationID, p_EntityID, p_URLFormat, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwIntegrationURLFormats" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelPriceType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT)
RETURNS SETOF __mj."vwAIModelPriceTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelPriceType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelPriceTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteWorkflowEngine"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."WorkflowEngine"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionContextType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionContextType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModel"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_AIModelTypeID UUID, IN p_PowerRank INTEGER, IN p_SpeedRank INTEGER, IN p_CostRank INTEGER, IN p_ModelSelectionInsights TEXT, IN p_PriorVersionID UUID, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_InheritTypeModalities BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIModels" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModel"
            ("ID", "Name", "Description", "AIModelTypeID", "PowerRank", "IsActive", "SpeedRank", "CostRank", "ModelSelectionInsights", "InheritTypeModalities", "PriorVersionID")
        VALUES
            (p_ID, p_Name, p_Description, p_AIModelTypeID, p_PowerRank, p_IsActive, p_SpeedRank, p_CostRank, p_ModelSelectionInsights, p_InheritTypeModalities, p_PriorVersionID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModel"
            ("Name", "Description", "AIModelTypeID", "PowerRank", "IsActive", "SpeedRank", "CostRank", "ModelSelectionInsights", "InheritTypeModalities", "PriorVersionID")
        VALUES
            (p_Name, p_Description, p_AIModelTypeID, p_PowerRank, p_IsActive, p_SpeedRank, p_CostRank, p_ModelSelectionInsights, p_InheritTypeModalities, p_PriorVersionID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteResourceLink"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ResourceLink"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAuthorizationRole"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AuthorizationRole"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteFileCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."FileCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCommunicationRun"(IN p_ID UUID, IN p_UserID UUID, IN p_Direction VARCHAR(20), IN p_Status VARCHAR(20), IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Comments TEXT, IN p_ErrorMessage TEXT)
RETURNS SETOF __mj."vwCommunicationRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CommunicationRun"
    SET
        "UserID" = p_UserID,
        "Direction" = p_Direction,
        "Status" = p_Status,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Comments" = p_Comments,
        "ErrorMessage" = p_ErrorMessage
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCommunicationRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserViewRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserViewRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateLibraryItem"(IN p_Name VARCHAR(255), IN p_LibraryID UUID, IN p_Type VARCHAR(50), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwLibraryItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."LibraryItem"
            ("ID", "Name", "LibraryID", "Type")
        VALUES
            (p_ID, p_Name, p_LibraryID, p_Type)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."LibraryItem"
            ("Name", "LibraryID", "Type")
        VALUES
            (p_Name, p_LibraryID, p_Type)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwLibraryItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptModel"(IN p_PromptID UUID, IN p_ModelID UUID, IN p_VendorID UUID, IN p_ConfigurationID UUID, IN p_ModelParameters TEXT, IN p_ParallelConfigParam VARCHAR(100), IN p_EffortLevel INTEGER, IN p_ID UUID DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL, IN p_ExecutionGroup INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_ParallelizationMode VARCHAR(20) DEFAULT NULL, IN p_ParallelCount INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIPromptModels" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPromptModel"
            ("ID", "PromptID", "ModelID", "VendorID", "ConfigurationID", "Priority", "ExecutionGroup", "ModelParameters", "Status", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "EffortLevel")
        VALUES
            (p_ID, p_PromptID, p_ModelID, p_VendorID, p_ConfigurationID, p_Priority, p_ExecutionGroup, p_ModelParameters, p_Status, p_ParallelizationMode, p_ParallelCount, p_ParallelConfigParam, p_EffortLevel)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPromptModel"
            ("PromptID", "ModelID", "VendorID", "ConfigurationID", "Priority", "ExecutionGroup", "ModelParameters", "Status", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "EffortLevel")
        VALUES
            (p_PromptID, p_ModelID, p_VendorID, p_ConfigurationID, p_Priority, p_ExecutionGroup, p_ModelParameters, p_Status, p_ParallelizationMode, p_ParallelCount, p_ParallelConfigParam, p_EffortLevel)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptModels" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendationRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecommendationRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteListInvitation"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ListInvitation"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityAIAction"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityAIAction"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSourceTypeParam"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentSourceTypeParam"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelPriceType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelPriceType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSourceType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description VARCHAR(1000))
RETURNS SETOF __mj."vwContentSourceTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentSourceType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentSourceTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAuditLogType"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_ParentID UUID, IN p_AuthorizationID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAuditLogTypes" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEmployee"(IN p_ID UUID, IN p_FirstName VARCHAR(30), IN p_LastName VARCHAR(50), IN p_CompanyID UUID, IN p_SupervisorID UUID, IN p_Title VARCHAR(50), IN p_Email VARCHAR(100), IN p_Phone VARCHAR(20), IN p_Active BOOLEAN)
RETURNS SETOF __mj."vwEmployees" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Employee"
    SET
        "FirstName" = p_FirstName,
        "LastName" = p_LastName,
        "CompanyID" = p_CompanyID,
        "SupervisorID" = p_SupervisorID,
        "Title" = p_Title,
        "Email" = p_Email,
        "Phone" = p_Phone,
        "Active" = p_Active
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEmployees" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDatasetItem"(IN p_Code VARCHAR(50), IN p_DatasetID UUID, IN p_EntityID UUID, IN p_WhereClause TEXT, IN p_DateFieldToCheck VARCHAR(100), IN p_Description TEXT, IN p_Columns TEXT, IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwDatasetItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DatasetItem"
            ("ID", "Code", "DatasetID", "Sequence", "EntityID", "WhereClause", "DateFieldToCheck", "Description", "Columns")
        VALUES
            (p_ID, p_Code, p_DatasetID, p_Sequence, p_EntityID, p_WhereClause, p_DateFieldToCheck, p_Description, p_Columns)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DatasetItem"
            ("Code", "DatasetID", "Sequence", "EntityID", "WhereClause", "DateFieldToCheck", "Description", "Columns")
        VALUES
            (p_Code, p_DatasetID, p_Sequence, p_EntityID, p_WhereClause, p_DateFieldToCheck, p_Description, p_Columns)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDatasetItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTemplate"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Template"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEncryptionAlgorithm"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_NodeCryptoName VARCHAR(50), IN p_KeyLengthBits INTEGER, IN p_IVLengthBytes INTEGER, IN p_ID UUID DEFAULT NULL, IN p_IsAEAD BOOLEAN DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEncryptionAlgorithms" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EncryptionAlgorithm"
            ("ID", "Name", "Description", "NodeCryptoName", "KeyLengthBits", "IVLengthBytes", "IsAEAD", "IsActive")
        VALUES
            (p_ID, p_Name, p_Description, p_NodeCryptoName, p_KeyLengthBits, p_IVLengthBytes, p_IsAEAD, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EncryptionAlgorithm"
            ("Name", "Description", "NodeCryptoName", "KeyLengthBits", "IVLengthBytes", "IsAEAD", "IsActive")
        VALUES
            (p_Name, p_Description, p_NodeCryptoName, p_KeyLengthBits, p_IVLengthBytes, p_IsAEAD, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEncryptionAlgorithms" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledJob"(IN p_ID UUID, IN p_JobTypeID UUID, IN p_Name VARCHAR(200), IN p_Description TEXT, IN p_CronExpression VARCHAR(120), IN p_Timezone VARCHAR(64), IN p_StartAt TIMESTAMPTZ, IN p_EndAt TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_Configuration TEXT, IN p_OwnerUserID UUID, IN p_LastRunAt TIMESTAMPTZ, IN p_NextRunAt TIMESTAMPTZ, IN p_RunCount INTEGER, IN p_SuccessCount INTEGER, IN p_FailureCount INTEGER, IN p_NotifyOnSuccess BOOLEAN, IN p_NotifyOnFailure BOOLEAN, IN p_NotifyUserID UUID, IN p_NotifyViaEmail BOOLEAN, IN p_NotifyViaInApp BOOLEAN, IN p_LockToken UUID, IN p_LockedAt TIMESTAMPTZ, IN p_LockedByInstance VARCHAR(255), IN p_ExpectedCompletionAt TIMESTAMPTZ, IN p_ConcurrencyMode VARCHAR(20))
RETURNS SETOF __mj."vwScheduledJobs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ScheduledJob"
    SET
        "JobTypeID" = p_JobTypeID,
        "Name" = p_Name,
        "Description" = p_Description,
        "CronExpression" = p_CronExpression,
        "Timezone" = p_Timezone,
        "StartAt" = p_StartAt,
        "EndAt" = p_EndAt,
        "Status" = p_Status,
        "Configuration" = p_Configuration,
        "OwnerUserID" = p_OwnerUserID,
        "LastRunAt" = p_LastRunAt,
        "NextRunAt" = p_NextRunAt,
        "RunCount" = p_RunCount,
        "SuccessCount" = p_SuccessCount,
        "FailureCount" = p_FailureCount,
        "NotifyOnSuccess" = p_NotifyOnSuccess,
        "NotifyOnFailure" = p_NotifyOnFailure,
        "NotifyUserID" = p_NotifyUserID,
        "NotifyViaEmail" = p_NotifyViaEmail,
        "NotifyViaInApp" = p_NotifyViaInApp,
        "LockToken" = p_LockToken,
        "LockedAt" = p_LockedAt,
        "LockedByInstance" = p_LockedByInstance,
        "ExpectedCompletionAt" = p_ExpectedCompletionAt,
        "ConcurrencyMode" = p_ConcurrencyMode
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwScheduledJobs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateWorkspaceItem"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_WorkspaceID UUID, IN p_ResourceTypeID UUID, IN p_ResourceRecordID VARCHAR(2000), IN p_Sequence INTEGER, IN p_Configuration TEXT)
RETURNS SETOF __mj."vwWorkspaceItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."WorkspaceItem"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "WorkspaceID" = p_WorkspaceID,
        "ResourceTypeID" = p_ResourceTypeID,
        "ResourceRecordID" = p_ResourceRecordID,
        "Sequence" = p_Sequence,
        "Configuration" = p_Configuration
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwWorkspaceItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationArtifactPermission"(IN p_ConversationArtifactID UUID, IN p_UserID UUID, IN p_AccessLevel VARCHAR(20), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwConversationArtifactPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationArtifactPermission"
            ("ID", "ConversationArtifactID", "UserID", "AccessLevel")
        VALUES
            (p_ID, p_ConversationArtifactID, p_UserID, p_AccessLevel)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationArtifactPermission"
            ("ConversationArtifactID", "UserID", "AccessLevel")
        VALUES
            (p_ConversationArtifactID, p_UserID, p_AccessLevel)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationArtifactPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFieldValue"(IN p_ID UUID, IN p_EntityFieldID UUID, IN p_Sequence INTEGER, IN p_Value VARCHAR(255), IN p_Code VARCHAR(50), IN p_Description TEXT)
RETURNS SETOF __mj."vwEntityFieldValues" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAction"(IN p_CategoryID UUID, IN p_Name VARCHAR(425), IN p_Description TEXT, IN p_UserPrompt TEXT, IN p_UserComments TEXT, IN p_Code TEXT, IN p_CodeComments TEXT, IN p_CodeApprovalComments TEXT, IN p_CodeApprovedByUserID UUID, IN p_CodeApprovedAt TIMESTAMPTZ, IN p_RetentionPeriod INTEGER, IN p_DriverClass VARCHAR(255), IN p_ParentID UUID, IN p_IconClass VARCHAR(100), IN p_DefaultCompactPromptID UUID, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(20) DEFAULT NULL, IN p_CodeApprovalStatus VARCHAR(20) DEFAULT NULL, IN p_CodeLocked BOOLEAN DEFAULT NULL, IN p_ForceCodeGeneration BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwActions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Action"
            ("ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID")
        VALUES
            (p_ID, p_CategoryID, p_Name, p_Description, p_Type, p_UserPrompt, p_UserComments, p_Code, p_CodeComments, p_CodeApprovalStatus, p_CodeApprovalComments, p_CodeApprovedByUserID, p_CodeApprovedAt, p_CodeLocked, p_ForceCodeGeneration, p_RetentionPeriod, p_Status, p_DriverClass, p_ParentID, p_IconClass, p_DefaultCompactPromptID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Action"
            ("CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID")
        VALUES
            (p_CategoryID, p_Name, p_Description, p_Type, p_UserPrompt, p_UserComments, p_Code, p_CodeComments, p_CodeApprovalStatus, p_CodeApprovalComments, p_CodeApprovedByUserID, p_CodeApprovedAt, p_CodeLocked, p_ForceCodeGeneration, p_RetentionPeriod, p_Status, p_DriverClass, p_ParentID, p_IconClass, p_DefaultCompactPromptID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(IN p_ConversationID UUID, IN p_ExternalID VARCHAR(100), IN p_Message TEXT, IN p_Error TEXT, IN p_UserRating INTEGER, IN p_UserFeedback TEXT, IN p_ReflectionInsights TEXT, IN p_SummaryOfEarlierConversation TEXT, IN p_UserID UUID, IN p_ArtifactID UUID, IN p_ArtifactVersionID UUID, IN p_CompletionTime BIGINT, IN p_ParentID UUID, IN p_AgentID UUID, IN p_SuggestedResponses TEXT, IN p_TestRunID UUID, IN p_ResponseForm TEXT, IN p_ActionableCommands TEXT, IN p_AutomaticCommands TEXT, IN p_ID UUID DEFAULT NULL, IN p_Role VARCHAR(20) DEFAULT NULL, IN p_HiddenToUser BOOLEAN DEFAULT NULL, IN p_IsPinned BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_OriginalMessageChanged BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwConversationDetails" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationDetail"
            ("ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged")
        VALUES
            (p_ID, p_ConversationID, p_ExternalID, p_Role, p_Message, p_Error, p_HiddenToUser, p_UserRating, p_UserFeedback, p_ReflectionInsights, p_SummaryOfEarlierConversation, p_UserID, p_ArtifactID, p_ArtifactVersionID, p_CompletionTime, p_IsPinned, p_ParentID, p_AgentID, p_Status, p_SuggestedResponses, p_TestRunID, p_ResponseForm, p_ActionableCommands, p_AutomaticCommands, p_OriginalMessageChanged)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationDetail"
            ("ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged")
        VALUES
            (p_ConversationID, p_ExternalID, p_Role, p_Message, p_Error, p_HiddenToUser, p_UserRating, p_UserFeedback, p_ReflectionInsights, p_SummaryOfEarlierConversation, p_UserID, p_ArtifactID, p_ArtifactVersionID, p_CompletionTime, p_IsPinned, p_ParentID, p_AgentID, p_Status, p_SuggestedResponses, p_TestRunID, p_ResponseForm, p_ActionableCommands, p_AutomaticCommands, p_OriginalMessageChanged)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationRun"(IN p_CompanyIntegrationID UUID, IN p_RunByUserID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_TotalRecords INTEGER, IN p_Comments TEXT, IN p_ErrorLog TEXT, IN p_ConfigData TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwCompanyIntegrationRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CompanyIntegrationRun"
            ("ID", "CompanyIntegrationID", "RunByUserID", "StartedAt", "EndedAt", "TotalRecords", "Comments", "Status", "ErrorLog", "ConfigData")
        VALUES
            (p_ID, p_CompanyIntegrationID, p_RunByUserID, p_StartedAt, p_EndedAt, p_TotalRecords, p_Comments, p_Status, p_ErrorLog, p_ConfigData)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CompanyIntegrationRun"
            ("CompanyIntegrationID", "RunByUserID", "StartedAt", "EndedAt", "TotalRecords", "Comments", "Status", "ErrorLog", "ConfigData")
        VALUES
            (p_CompanyIntegrationID, p_RunByUserID, p_StartedAt, p_EndedAt, p_TotalRecords, p_Comments, p_Status, p_ErrorLog, p_ConfigData)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestRunFeedback"(IN p_ID UUID, IN p_TestRunID UUID, IN p_ReviewerUserID UUID, IN p_Rating INTEGER, IN p_IsCorrect BOOLEAN, IN p_CorrectionSummary TEXT, IN p_Comments TEXT, IN p_ReviewedAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwTestRunFeedbacks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TestRunFeedback"
    SET
        "TestRunID" = p_TestRunID,
        "ReviewerUserID" = p_ReviewerUserID,
        "Rating" = p_Rating,
        "IsCorrect" = p_IsCorrect,
        "CorrectionSummary" = p_CorrectionSummary,
        "Comments" = p_Comments,
        "ReviewedAt" = p_ReviewedAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTestRunFeedbacks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTaskType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TaskType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteWorkspaceItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."WorkspaceItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptModel"(IN p_ID UUID, IN p_PromptID UUID, IN p_ModelID UUID, IN p_VendorID UUID, IN p_ConfigurationID UUID, IN p_Priority INTEGER, IN p_ExecutionGroup INTEGER, IN p_ModelParameters TEXT, IN p_Status VARCHAR(20), IN p_ParallelizationMode VARCHAR(20), IN p_ParallelCount INTEGER, IN p_ParallelConfigParam VARCHAR(100), IN p_EffortLevel INTEGER)
RETURNS SETOF __mj."vwAIPromptModels" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIPromptModel"
    SET
        "PromptID" = p_PromptID,
        "ModelID" = p_ModelID,
        "VendorID" = p_VendorID,
        "ConfigurationID" = p_ConfigurationID,
        "Priority" = p_Priority,
        "ExecutionGroup" = p_ExecutionGroup,
        "ModelParameters" = p_ModelParameters,
        "Status" = p_Status,
        "ParallelizationMode" = p_ParallelizationMode,
        "ParallelCount" = p_ParallelCount,
        "ParallelConfigParam" = p_ParallelConfigParam,
        "EffortLevel" = p_EffortLevel
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptModels" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteFileEntityRecordLink"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."FileEntityRecordLink"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModel"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_AIModelTypeID UUID, IN p_PowerRank INTEGER, IN p_IsActive BOOLEAN, IN p_SpeedRank INTEGER, IN p_CostRank INTEGER, IN p_ModelSelectionInsights TEXT, IN p_InheritTypeModalities BOOLEAN, IN p_PriorVersionID UUID)
RETURNS SETOF __mj."vwAIModels" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModel"
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
        "PriorVersionID" = p_PriorVersionID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelPriceUnitType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelPriceUnitType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateFileCategory"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_ParentID UUID, IN p_Description TEXT)
RETURNS SETOF __mj."vwFileCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteResourceType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ResourceType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteComponentRegistry"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ComponentRegistry"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentArtifactType"(IN p_AgentID UUID, IN p_ArtifactTypeID UUID, IN p_Sequence INTEGER, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentArtifactTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentArtifactType"
            ("ID", "AgentID", "ArtifactTypeID", "Sequence")
        VALUES
            (p_ID, p_AgentID, p_ArtifactTypeID, p_Sequence)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentArtifactType"
            ("AgentID", "ArtifactTypeID", "Sequence")
        VALUES
            (p_AgentID, p_ArtifactTypeID, p_Sequence)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentArtifactTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTemplateCategory"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwTemplateCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionParam"(IN p_EntityActionID UUID, IN p_ActionParamID UUID, IN p_ValueType VARCHAR(20), IN p_Value TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityActionParams" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityActionParam"
            ("ID", "EntityActionID", "ActionParamID", "ValueType", "Value", "Comments")
        VALUES
            (p_ID, p_EntityActionID, p_ActionParamID, p_ValueType, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityActionParam"
            ("EntityActionID", "ActionParamID", "ValueType", "Value", "Comments")
        VALUES
            (p_EntityActionID, p_ActionParamID, p_ValueType, p_Value, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityCommunicationField"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityCommunicationField"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionContext"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionContext"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDatasetItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DatasetItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboardCategoryLink"(IN p_DashboardID UUID, IN p_UserID UUID, IN p_DashboardCategoryID UUID, IN p_DisplayName VARCHAR(255), IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwDashboardCategoryLinks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DashboardCategoryLink"
            ("ID", "DashboardID", "UserID", "DashboardCategoryID", "DisplayName", "Sequence")
        VALUES
            (p_ID, p_DashboardID, p_UserID, p_DashboardCategoryID, p_DisplayName, p_Sequence)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DashboardCategoryLink"
            ("DashboardID", "UserID", "DashboardCategoryID", "DisplayName", "Sequence")
        VALUES
            (p_DashboardID, p_UserID, p_DashboardCategoryID, p_DisplayName, p_Sequence)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboardCategoryLinks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserApplicationEntity"(IN p_UserApplicationID UUID, IN p_EntityID UUID, IN p_ID UUID DEFAULT NULL, IN p_Sequence INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwUserApplicationEntities" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserApplicationEntity"
            ("ID", "UserApplicationID", "EntityID", "Sequence")
        VALUES
            (p_ID, p_UserApplicationID, p_EntityID, p_Sequence)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserApplicationEntity"
            ("UserApplicationID", "EntityID", "Sequence")
        VALUES
            (p_UserApplicationID, p_EntityID, p_Sequence)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserApplicationEntities" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateMCPServerConnectionTool"(IN p_MCPServerConnectionID UUID, IN p_MCPServerToolID UUID, IN p_DefaultInputValues TEXT, IN p_MaxCallsPerMinute INTEGER, IN p_ID UUID DEFAULT NULL, IN p_IsEnabled BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwMCPServerConnectionTools" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."MCPServerConnectionTool"
            ("ID", "MCPServerConnectionID", "MCPServerToolID", "IsEnabled", "DefaultInputValues", "MaxCallsPerMinute")
        VALUES
            (p_ID, p_MCPServerConnectionID, p_MCPServerToolID, p_IsEnabled, p_DefaultInputValues, p_MaxCallsPerMinute)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."MCPServerConnectionTool"
            ("MCPServerConnectionID", "MCPServerToolID", "IsEnabled", "DefaultInputValues", "MaxCallsPerMinute")
        VALUES
            (p_MCPServerConnectionID, p_MCPServerToolID, p_IsEnabled, p_DefaultInputValues, p_MaxCallsPerMinute)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerConnectionTools" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIPromptRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateScheduledJobType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255), IN p_DomainRunEntity VARCHAR(255), IN p_DomainRunEntityFKey VARCHAR(100), IN p_ID UUID DEFAULT NULL, IN p_NotificationsAvailable BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwScheduledJobTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ScheduledJobType"
            ("ID", "Name", "Description", "DriverClass", "DomainRunEntity", "DomainRunEntityFKey", "NotificationsAvailable")
        VALUES
            (p_ID, p_Name, p_Description, p_DriverClass, p_DomainRunEntity, p_DomainRunEntityFKey, p_NotificationsAvailable)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ScheduledJobType"
            ("Name", "Description", "DriverClass", "DomainRunEntity", "DomainRunEntityFKey", "NotificationsAvailable")
        VALUES
            (p_Name, p_Description, p_DriverClass, p_DomainRunEntity, p_DomainRunEntityFKey, p_NotificationsAvailable)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwScheduledJobTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardCategoryLink"(IN p_ID UUID, IN p_DashboardID UUID, IN p_UserID UUID, IN p_DashboardCategoryID UUID, IN p_DisplayName VARCHAR(255), IN p_Sequence INTEGER)
RETURNS SETOF __mj."vwDashboardCategoryLinks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DashboardCategoryLink"
    SET
        "DashboardID" = p_DashboardID,
        "UserID" = p_UserID,
        "DashboardCategoryID" = p_DashboardCategoryID,
        "DisplayName" = p_DisplayName,
        "Sequence" = p_Sequence
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboardCategoryLinks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateMCPServerConnectionTool"(IN p_ID UUID, IN p_MCPServerConnectionID UUID, IN p_MCPServerToolID UUID, IN p_IsEnabled BOOLEAN, IN p_DefaultInputValues TEXT, IN p_MaxCallsPerMinute INTEGER)
RETURNS SETOF __mj."vwMCPServerConnectionTools" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."MCPServerConnectionTool"
    SET
        "MCPServerConnectionID" = p_MCPServerConnectionID,
        "MCPServerToolID" = p_MCPServerToolID,
        "IsEnabled" = p_IsEnabled,
        "DefaultInputValues" = p_DefaultInputValues,
        "MaxCallsPerMinute" = p_MaxCallsPerMinute
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerConnectionTools" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboardUserPreference"(IN p_UserID UUID, IN p_DashboardID UUID, IN p_Scope VARCHAR(20), IN p_ApplicationID UUID, IN p_DisplayOrder INTEGER, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwDashboardUserPreferences" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DashboardUserPreference"
            ("ID", "UserID", "DashboardID", "Scope", "ApplicationID", "DisplayOrder")
        VALUES
            (p_ID, p_UserID, p_DashboardID, p_Scope, p_ApplicationID, p_DisplayOrder)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DashboardUserPreference"
            ("UserID", "DashboardID", "Scope", "ApplicationID", "DisplayOrder")
        VALUES
            (p_UserID, p_DashboardID, p_Scope, p_ApplicationID, p_DisplayOrder)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboardUserPreferences" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAuditLogType"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_ParentID UUID, IN p_AuthorizationID UUID)
RETURNS SETOF __mj."vwAuditLogTypes" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQuery"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Query"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateVersionInstallation"(IN p_MajorVersion INTEGER, IN p_MinorVersion INTEGER, IN p_PatchVersion INTEGER, IN p_Type VARCHAR(20), IN p_InstalledAt TIMESTAMPTZ, IN p_InstallLog TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwVersionInstallations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."VersionInstallation"
            ("ID", "MajorVersion", "MinorVersion", "PatchVersion", "Type", "InstalledAt", "Status", "InstallLog", "Comments")
        VALUES
            (p_ID, p_MajorVersion, p_MinorVersion, p_PatchVersion, p_Type, p_InstalledAt, p_Status, p_InstallLog, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."VersionInstallation"
            ("MajorVersion", "MinorVersion", "PatchVersion", "Type", "InstalledAt", "Status", "InstallLog", "Comments")
        VALUES
            (p_MajorVersion, p_MinorVersion, p_PatchVersion, p_Type, p_InstalledAt, p_Status, p_InstallLog, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwVersionInstallations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueryParameter"(IN p_QueryID UUID, IN p_Name VARCHAR(255), IN p_Type VARCHAR(50), IN p_IsRequired BOOLEAN, IN p_DefaultValue TEXT, IN p_Description TEXT, IN p_SampleValue TEXT, IN p_ValidationFilters TEXT, IN p_AutoDetectConfidenceScore NUMERIC(3,2), IN p_ID UUID DEFAULT NULL, IN p_DetectionMethod VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwQueryParameters" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueryParameter"
            ("ID", "QueryID", "Name", "Type", "IsRequired", "DefaultValue", "Description", "SampleValue", "ValidationFilters", "DetectionMethod", "AutoDetectConfidenceScore")
        VALUES
            (p_ID, p_QueryID, p_Name, p_Type, p_IsRequired, p_DefaultValue, p_Description, p_SampleValue, p_ValidationFilters, p_DetectionMethod, p_AutoDetectConfidenceScore)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueryParameter"
            ("QueryID", "Name", "Type", "IsRequired", "DefaultValue", "Description", "SampleValue", "ValidationFilters", "DetectionMethod", "AutoDetectConfidenceScore")
        VALUES
            (p_QueryID, p_Name, p_Type, p_IsRequired, p_DefaultValue, p_Description, p_SampleValue, p_ValidationFilters, p_DetectionMethod, p_AutoDetectConfidenceScore)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueryParameters" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIArchitecture"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIArchitecture"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNoteType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentNoteType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionContextType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwActionContextTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionContextType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionContextType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionContextTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptCategory"(IN p_Name VARCHAR(255), IN p_ParentID UUID, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIPromptCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAction"(IN p_ID UUID, IN p_CategoryID UUID, IN p_Name VARCHAR(425), IN p_Description TEXT, IN p_Type VARCHAR(20), IN p_UserPrompt TEXT, IN p_UserComments TEXT, IN p_Code TEXT, IN p_CodeComments TEXT, IN p_CodeApprovalStatus VARCHAR(20), IN p_CodeApprovalComments TEXT, IN p_CodeApprovedByUserID UUID, IN p_CodeApprovedAt TIMESTAMPTZ, IN p_CodeLocked BOOLEAN, IN p_ForceCodeGeneration BOOLEAN, IN p_RetentionPeriod INTEGER, IN p_Status VARCHAR(20), IN p_DriverClass VARCHAR(255), IN p_ParentID UUID, IN p_IconClass VARCHAR(100), IN p_DefaultCompactPromptID UUID)
RETURNS SETOF __mj."vwActions" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDatasetItem"(IN p_ID UUID, IN p_Code VARCHAR(50), IN p_DatasetID UUID, IN p_Sequence INTEGER, IN p_EntityID UUID, IN p_WhereClause TEXT, IN p_DateFieldToCheck VARCHAR(100), IN p_Description TEXT, IN p_Columns TEXT)
RETURNS SETOF __mj."vwDatasetItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DatasetItem"
    SET
        "Code" = p_Code,
        "DatasetID" = p_DatasetID,
        "Sequence" = p_Sequence,
        "EntityID" = p_EntityID,
        "WhereClause" = p_WhereClause,
        "DateFieldToCheck" = p_DateFieldToCheck,
        "Description" = p_Description,
        "Columns" = p_Columns
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDatasetItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardCategoryLink"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DashboardCategoryLink"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteResourcePermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ResourcePermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerConnectionTool"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."MCPServerConnectionTool"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationURLFormat"(IN p_ID UUID, IN p_IntegrationID UUID, IN p_EntityID UUID, IN p_URLFormat VARCHAR(500), IN p_Comments TEXT)
RETURNS SETOF __mj."vwIntegrationURLFormats" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."IntegrationURLFormat"
    SET
        "IntegrationID" = p_IntegrationID,
        "EntityID" = p_EntityID,
        "URLFormat" = p_URLFormat,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwIntegrationURLFormats" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelPriceUnitType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelPriceUnitTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelPriceUnitType"
            ("ID", "Name", "Description", "DriverClass")
        VALUES
            (p_ID, p_Name, p_Description, p_DriverClass)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelPriceUnitType"
            ("Name", "Description", "DriverClass")
        VALUES
            (p_Name, p_Description, p_DriverClass)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelPriceUnitTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityCommunicationMessageType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityCommunicationMessageType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelArchitecture"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelArchitecture"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionParam"(IN p_ID UUID, IN p_EntityActionID UUID, IN p_ActionParamID UUID, IN p_ValueType VARCHAR(20), IN p_Value TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwEntityActionParams" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityActionParam"
    SET
        "EntityActionID" = p_EntityActionID,
        "ActionParamID" = p_ActionParamID,
        "ValueType" = p_ValueType,
        "Value" = p_Value,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationArtifactPermission"(IN p_ID UUID, IN p_ConversationArtifactID UUID, IN p_UserID UUID, IN p_AccessLevel VARCHAR(20))
RETURNS SETOF __mj."vwConversationArtifactPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ConversationArtifactPermission"
    SET
        "ConversationArtifactID" = p_ConversationArtifactID,
        "UserID" = p_UserID,
        "AccessLevel" = p_AccessLevel
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversationArtifactPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntity"(IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_NameSuffix VARCHAR(255), IN p_Description TEXT, IN p_BaseView VARCHAR(255), IN p_FullTextCatalog VARCHAR(255), IN p_FullTextIndex VARCHAR(255), IN p_FullTextSearchFunction VARCHAR(255), IN p_UserViewMaxRows INTEGER, IN p_spCreate VARCHAR(255), IN p_spUpdate VARCHAR(255), IN p_spDelete VARCHAR(255), IN p_spMatch VARCHAR(255), IN p_EntityObjectSubclassName VARCHAR(255), IN p_EntityObjectSubclassImport VARCHAR(255), IN p_PreferredCommunicationField VARCHAR(255), IN p_Icon VARCHAR(500), IN p_ScopeDefault VARCHAR(100), IN p_RowsToPackSampleOrder TEXT, IN p_AutoRowCountFrequency INTEGER, IN p_RowCount BIGINT, IN p_RowCountRunAt TIMESTAMPTZ, IN p_DisplayName VARCHAR(255), IN p_ID UUID DEFAULT NULL, IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL, IN p_BaseViewGenerated BOOLEAN DEFAULT NULL, IN p_VirtualEntity BOOLEAN DEFAULT NULL, IN p_TrackRecordChanges BOOLEAN DEFAULT NULL, IN p_AuditRecordAccess BOOLEAN DEFAULT NULL, IN p_AuditViewRuns BOOLEAN DEFAULT NULL, IN p_IncludeInAPI BOOLEAN DEFAULT NULL, IN p_AllowAllRowsAPI BOOLEAN DEFAULT NULL, IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL, IN p_AllowCreateAPI BOOLEAN DEFAULT NULL, IN p_AllowDeleteAPI BOOLEAN DEFAULT NULL, IN p_CustomResolverAPI BOOLEAN DEFAULT NULL, IN p_AllowUserSearchAPI BOOLEAN DEFAULT NULL, IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL, IN p_FullTextCatalogGenerated BOOLEAN DEFAULT NULL, IN p_FullTextIndexGenerated BOOLEAN DEFAULT NULL, IN p_FullTextSearchFunctionGenerated BOOLEAN DEFAULT NULL, IN p_spCreateGenerated BOOLEAN DEFAULT NULL, IN p_spUpdateGenerated BOOLEAN DEFAULT NULL, IN p_spDeleteGenerated BOOLEAN DEFAULT NULL, IN p_CascadeDeletes BOOLEAN DEFAULT NULL, IN p_DeleteType VARCHAR(10) DEFAULT NULL, IN p_AllowRecordMerge BOOLEAN DEFAULT NULL, IN p_RelationshipDefaultDisplayType VARCHAR(20) DEFAULT NULL, IN p_UserFormGenerated BOOLEAN DEFAULT NULL, IN p_RowsToPackWithSchema VARCHAR(20) DEFAULT NULL, IN p_RowsToPackSampleMethod VARCHAR(20) DEFAULT NULL, IN p_RowsToPackSampleCount INTEGER DEFAULT NULL, IN p_Status VARCHAR(25) DEFAULT NULL)
RETURNS SETOF __mj."vwEntities" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Entity"
            ("ID", "ParentID", "Name", "NameSuffix", "Description", "AutoUpdateDescription", "BaseView", "BaseViewGenerated", "VirtualEntity", "TrackRecordChanges", "AuditRecordAccess", "AuditViewRuns", "IncludeInAPI", "AllowAllRowsAPI", "AllowUpdateAPI", "AllowCreateAPI", "AllowDeleteAPI", "CustomResolverAPI", "AllowUserSearchAPI", "FullTextSearchEnabled", "FullTextCatalog", "FullTextCatalogGenerated", "FullTextIndex", "FullTextIndexGenerated", "FullTextSearchFunction", "FullTextSearchFunctionGenerated", "UserViewMaxRows", "spCreate", "spUpdate", "spDelete", "spCreateGenerated", "spUpdateGenerated", "spDeleteGenerated", "CascadeDeletes", "DeleteType", "AllowRecordMerge", "spMatch", "RelationshipDefaultDisplayType", "UserFormGenerated", "EntityObjectSubclassName", "EntityObjectSubclassImport", "PreferredCommunicationField", "Icon", "ScopeDefault", "RowsToPackWithSchema", "RowsToPackSampleMethod", "RowsToPackSampleCount", "RowsToPackSampleOrder", "AutoRowCountFrequency", "RowCount", "RowCountRunAt", "Status", "DisplayName")
        VALUES
            (p_ID, p_ParentID, p_Name, p_NameSuffix, p_Description, p_AutoUpdateDescription, p_BaseView, p_BaseViewGenerated, p_VirtualEntity, p_TrackRecordChanges, p_AuditRecordAccess, p_AuditViewRuns, p_IncludeInAPI, p_AllowAllRowsAPI, p_AllowUpdateAPI, p_AllowCreateAPI, p_AllowDeleteAPI, p_CustomResolverAPI, p_AllowUserSearchAPI, p_FullTextSearchEnabled, p_FullTextCatalog, p_FullTextCatalogGenerated, p_FullTextIndex, p_FullTextIndexGenerated, p_FullTextSearchFunction, p_FullTextSearchFunctionGenerated, p_UserViewMaxRows, p_spCreate, p_spUpdate, p_spDelete, p_spCreateGenerated, p_spUpdateGenerated, p_spDeleteGenerated, p_CascadeDeletes, p_DeleteType, p_AllowRecordMerge, p_spMatch, p_RelationshipDefaultDisplayType, p_UserFormGenerated, p_EntityObjectSubclassName, p_EntityObjectSubclassImport, p_PreferredCommunicationField, p_Icon, p_ScopeDefault, p_RowsToPackWithSchema, p_RowsToPackSampleMethod, p_RowsToPackSampleCount, p_RowsToPackSampleOrder, p_AutoRowCountFrequency, p_RowCount, p_RowCountRunAt, p_Status, p_DisplayName)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Entity"
            ("ParentID", "Name", "NameSuffix", "Description", "AutoUpdateDescription", "BaseView", "BaseViewGenerated", "VirtualEntity", "TrackRecordChanges", "AuditRecordAccess", "AuditViewRuns", "IncludeInAPI", "AllowAllRowsAPI", "AllowUpdateAPI", "AllowCreateAPI", "AllowDeleteAPI", "CustomResolverAPI", "AllowUserSearchAPI", "FullTextSearchEnabled", "FullTextCatalog", "FullTextCatalogGenerated", "FullTextIndex", "FullTextIndexGenerated", "FullTextSearchFunction", "FullTextSearchFunctionGenerated", "UserViewMaxRows", "spCreate", "spUpdate", "spDelete", "spCreateGenerated", "spUpdateGenerated", "spDeleteGenerated", "CascadeDeletes", "DeleteType", "AllowRecordMerge", "spMatch", "RelationshipDefaultDisplayType", "UserFormGenerated", "EntityObjectSubclassName", "EntityObjectSubclassImport", "PreferredCommunicationField", "Icon", "ScopeDefault", "RowsToPackWithSchema", "RowsToPackSampleMethod", "RowsToPackSampleCount", "RowsToPackSampleOrder", "AutoRowCountFrequency", "RowCount", "RowCountRunAt", "Status", "DisplayName")
        VALUES
            (p_ParentID, p_Name, p_NameSuffix, p_Description, p_AutoUpdateDescription, p_BaseView, p_BaseViewGenerated, p_VirtualEntity, p_TrackRecordChanges, p_AuditRecordAccess, p_AuditViewRuns, p_IncludeInAPI, p_AllowAllRowsAPI, p_AllowUpdateAPI, p_AllowCreateAPI, p_AllowDeleteAPI, p_CustomResolverAPI, p_AllowUserSearchAPI, p_FullTextSearchEnabled, p_FullTextCatalog, p_FullTextCatalogGenerated, p_FullTextIndex, p_FullTextIndexGenerated, p_FullTextSearchFunction, p_FullTextSearchFunctionGenerated, p_UserViewMaxRows, p_spCreate, p_spUpdate, p_spDelete, p_spCreateGenerated, p_spUpdateGenerated, p_spDeleteGenerated, p_CascadeDeletes, p_DeleteType, p_AllowRecordMerge, p_spMatch, p_RelationshipDefaultDisplayType, p_UserFormGenerated, p_EntityObjectSubclassName, p_EntityObjectSubclassImport, p_PreferredCommunicationField, p_Icon, p_ScopeDefault, p_RowsToPackWithSchema, p_RowsToPackSampleMethod, p_RowsToPackSampleCount, p_RowsToPackSampleOrder, p_AutoRowCountFrequency, p_RowCount, p_RowCountRunAt, p_Status, p_DisplayName)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRole"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DirectoryID VARCHAR(250), IN p_SQLName VARCHAR(250), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRoles" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Role"
            ("ID", "Name", "Description", "DirectoryID", "SQLName")
        VALUES
            (p_ID, p_Name, p_Description, p_DirectoryID, p_SQLName)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Role"
            ("Name", "Description", "DirectoryID", "SQLName")
        VALUES
            (p_Name, p_Description, p_DirectoryID, p_SQLName)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRoles" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRunDetailMatch"(IN p_DuplicateRunDetailID UUID, IN p_MatchRecordID VARCHAR(500), IN p_RecordMergeLogID UUID, IN p_ID UUID DEFAULT NULL, IN p_MatchSource VARCHAR(20) DEFAULT NULL, IN p_MatchProbability NUMERIC(12,11) DEFAULT NULL, IN p_MatchedAt TIMESTAMPTZ DEFAULT NULL, IN p_Action VARCHAR(20) DEFAULT NULL, IN p_ApprovalStatus VARCHAR(20) DEFAULT NULL, IN p_MergeStatus VARCHAR(20) DEFAULT NULL, IN p_MergedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwDuplicateRunDetailMatches" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DuplicateRunDetailMatch"
            ("ID", "DuplicateRunDetailID", "MatchSource", "MatchRecordID", "MatchProbability", "MatchedAt", "Action", "ApprovalStatus", "RecordMergeLogID", "MergeStatus", "MergedAt")
        VALUES
            (p_ID, p_DuplicateRunDetailID, p_MatchSource, p_MatchRecordID, p_MatchProbability, p_MatchedAt, p_Action, p_ApprovalStatus, p_RecordMergeLogID, p_MergeStatus, p_MergedAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DuplicateRunDetailMatch"
            ("DuplicateRunDetailID", "MatchSource", "MatchRecordID", "MatchProbability", "MatchedAt", "Action", "ApprovalStatus", "RecordMergeLogID", "MergeStatus", "MergedAt")
        VALUES
            (p_DuplicateRunDetailID, p_MatchSource, p_MatchRecordID, p_MatchProbability, p_MatchedAt, p_Action, p_ApprovalStatus, p_RecordMergeLogID, p_MergeStatus, p_MergedAt)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetailMatches" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboardCategoryPermission"(IN p_DashboardCategoryID UUID, IN p_UserID UUID, IN p_SharedByUserID UUID, IN p_ID UUID DEFAULT NULL, IN p_CanRead BOOLEAN DEFAULT NULL, IN p_CanEdit BOOLEAN DEFAULT NULL, IN p_CanAddRemove BOOLEAN DEFAULT NULL, IN p_CanShare BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwDashboardCategoryPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DashboardCategoryPermission"
            ("ID", "DashboardCategoryID", "UserID", "CanRead", "CanEdit", "CanAddRemove", "CanShare", "SharedByUserID")
        VALUES
            (p_ID, p_DashboardCategoryID, p_UserID, p_CanRead, p_CanEdit, p_CanAddRemove, p_CanShare, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DashboardCategoryPermission"
            ("DashboardCategoryID", "UserID", "CanRead", "CanEdit", "CanAddRemove", "CanShare", "SharedByUserID")
        VALUES
            (p_DashboardCategoryID, p_UserID, p_CanRead, p_CanEdit, p_CanAddRemove, p_CanShare, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboardCategoryPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateLibraryItem"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_LibraryID UUID, IN p_Type VARCHAR(50))
RETURNS SETOF __mj."vwLibraryItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."LibraryItem"
    SET
        "Name" = p_Name,
        "LibraryID" = p_LibraryID,
        "Type" = p_Type
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwLibraryItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateMCPServerConnectionPermission"(IN p_MCPServerConnectionID UUID, IN p_UserID UUID, IN p_RoleID UUID, IN p_ID UUID DEFAULT NULL, IN p_CanExecute BOOLEAN DEFAULT NULL, IN p_CanModify BOOLEAN DEFAULT NULL, IN p_CanViewCredentials BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwMCPServerConnectionPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."MCPServerConnectionPermission"
            ("ID", "MCPServerConnectionID", "UserID", "RoleID", "CanExecute", "CanModify", "CanViewCredentials")
        VALUES
            (p_ID, p_MCPServerConnectionID, p_UserID, p_RoleID, p_CanExecute, p_CanModify, p_CanViewCredentials)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."MCPServerConnectionPermission"
            ("MCPServerConnectionID", "UserID", "RoleID", "CanExecute", "CanModify", "CanViewCredentials")
        VALUES
            (p_MCPServerConnectionID, p_UserID, p_RoleID, p_CanExecute, p_CanModify, p_CanViewCredentials)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerConnectionPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAuthorization"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Authorization"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTask"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Task"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityFieldValue"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityFieldValue"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardCategoryPermission"(IN p_ID UUID, IN p_DashboardCategoryID UUID, IN p_UserID UUID, IN p_CanRead BOOLEAN, IN p_CanEdit BOOLEAN, IN p_CanAddRemove BOOLEAN, IN p_CanShare BOOLEAN, IN p_SharedByUserID UUID)
RETURNS SETOF __mj."vwDashboardCategoryPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DashboardCategoryPermission"
    SET
        "DashboardCategoryID" = p_DashboardCategoryID,
        "UserID" = p_UserID,
        "CanRead" = p_CanRead,
        "CanEdit" = p_CanEdit,
        "CanAddRemove" = p_CanAddRemove,
        "CanShare" = p_CanShare,
        "SharedByUserID" = p_SharedByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboardCategoryPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemTag"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentItemTag"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateMCPServerConnectionPermission"(IN p_ID UUID, IN p_MCPServerConnectionID UUID, IN p_UserID UUID, IN p_RoleID UUID, IN p_CanExecute BOOLEAN, IN p_CanModify BOOLEAN, IN p_CanViewCredentials BOOLEAN)
RETURNS SETOF __mj."vwMCPServerConnectionPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."MCPServerConnectionPermission"
    SET
        "MCPServerConnectionID" = p_MCPServerConnectionID,
        "UserID" = p_UserID,
        "RoleID" = p_RoleID,
        "CanExecute" = p_CanExecute,
        "CanModify" = p_CanModify,
        "CanViewCredentials" = p_CanViewCredentials
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerConnectionPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecommendationItem"(IN p_RecommendationID UUID, IN p_DestinationEntityID UUID, IN p_DestinationEntityRecordID VARCHAR(450), IN p_MatchProbability NUMERIC(18,15), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRecommendationItems" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecommendationItem"
            ("ID", "RecommendationID", "DestinationEntityID", "DestinationEntityRecordID", "MatchProbability")
        VALUES
            (p_ID, p_RecommendationID, p_DestinationEntityID, p_DestinationEntityRecordID, p_MatchProbability)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecommendationItem"
            ("RecommendationID", "DestinationEntityID", "DestinationEntityRecordID", "MatchProbability")
        VALUES
            (p_RecommendationID, p_DestinationEntityID, p_DestinationEntityRecordID, p_MatchProbability)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecommendationItems" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCollection"(IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Icon VARCHAR(50), IN p_Color VARCHAR(7), IN p_Sequence INTEGER, IN p_OwnerID UUID, IN p_ID UUID DEFAULT NULL, IN p_EnvironmentID UUID DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Collection"
            ("ID", "EnvironmentID", "ParentID", "Name", "Description", "Icon", "Color", "Sequence", "OwnerID")
        VALUES
            (p_ID, p_EnvironmentID, p_ParentID, p_Name, p_Description, p_Icon, p_Color, p_Sequence, p_OwnerID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Collection" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptCategory"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_ParentID UUID, IN p_Description TEXT)
RETURNS SETOF __mj."vwAIPromptCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateComponentDependency"(IN p_ComponentID UUID, IN p_DependencyComponentID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwComponentDependencies" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ComponentDependency"
            ("ID", "ComponentID", "DependencyComponentID")
        VALUES
            (p_ID, p_ComponentID, p_DependencyComponentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ComponentDependency"
            ("ComponentID", "DependencyComponentID")
        VALUES
            (p_ComponentID, p_DependencyComponentID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwComponentDependencies" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserViewRunDetail"(IN p_UserViewRunID UUID, IN p_RecordID VARCHAR(450), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwUserViewRunDetails" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserViewRunDetail"
            ("ID", "UserViewRunID", "RecordID")
        VALUES
            (p_ID, p_UserViewRunID, p_RecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserViewRunDetail"
            ("UserViewRunID", "RecordID")
        VALUES
            (p_UserViewRunID, p_RecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserViewRunDetails" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestRunFeedback"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TestRunFeedback"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModelType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteComponent"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Component"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardCategoryPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DashboardCategoryPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerConnectionPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."MCPServerConnectionPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationRun"(IN p_ID UUID, IN p_CompanyIntegrationID UUID, IN p_RunByUserID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_TotalRecords INTEGER, IN p_Comments TEXT, IN p_Status VARCHAR(20), IN p_ErrorLog TEXT, IN p_ConfigData TEXT)
RETURNS SETOF __mj."vwCompanyIntegrationRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."CompanyIntegrationRun"
    SET
        "CompanyIntegrationID" = p_CompanyIntegrationID,
        "RunByUserID" = p_RunByUserID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "TotalRecords" = p_TotalRecords,
        "Comments" = p_Comments,
        "Status" = p_Status,
        "ErrorLog" = p_ErrorLog,
        "ConfigData" = p_ConfigData
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelPriceUnitType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255))
RETURNS SETOF __mj."vwAIModelPriceUnitTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelPriceUnitType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelPriceUnitTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentStepPath"(IN p_OriginStepID UUID, IN p_DestinationStepID UUID, IN p_Condition TEXT, IN p_Description VARCHAR(255), IN p_PathPoints TEXT, IN p_ID UUID DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentStepPaths" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentStepPath"
            ("ID", "OriginStepID", "DestinationStepID", "Condition", "Priority", "Description", "PathPoints")
        VALUES
            (p_ID, p_OriginStepID, p_DestinationStepID, p_Condition, p_Priority, p_Description, p_PathPoints)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentStepPath"
            ("OriginStepID", "DestinationStepID", "Condition", "Priority", "Description", "PathPoints")
        VALUES
            (p_OriginStepID, p_DestinationStepID, p_Condition, p_Priority, p_Description, p_PathPoints)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentStepPaths" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionExecutionLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionExecutionLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTaskType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwTaskTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TaskType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TaskType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTaskTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserRecordLog"(IN p_UserID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_ID UUID DEFAULT NULL, IN p_EarliestAt TIMESTAMPTZ DEFAULT NULL, IN p_LatestAt TIMESTAMPTZ DEFAULT NULL, IN p_TotalCount INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwUserRecordLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserRecordLog"
            ("ID", "UserID", "EntityID", "RecordID", "EarliestAt", "LatestAt", "TotalCount")
        VALUES
            (p_ID, p_UserID, p_EntityID, p_RecordID, p_EarliestAt, p_LatestAt, p_TotalCount)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."UserRecordLog"
            ("UserID", "EntityID", "RecordID", "EarliestAt", "LatestAt", "TotalCount")
        VALUES
            (p_UserID, p_EntityID, p_RecordID, p_EarliestAt, p_LatestAt, p_TotalCount)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserRecordLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteFile"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."File"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteQueueTask"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."QueueTask"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserApplication"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserApplication"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboardPermission"(IN p_DashboardID UUID, IN p_UserID UUID, IN p_SharedByUserID UUID, IN p_ID UUID DEFAULT NULL, IN p_CanRead BOOLEAN DEFAULT NULL, IN p_CanEdit BOOLEAN DEFAULT NULL, IN p_CanDelete BOOLEAN DEFAULT NULL, IN p_CanShare BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwDashboardPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DashboardPermission"
            ("ID", "DashboardID", "UserID", "CanRead", "CanEdit", "CanDelete", "CanShare", "SharedByUserID")
        VALUES
            (p_ID, p_DashboardID, p_UserID, p_CanRead, p_CanEdit, p_CanDelete, p_CanShare, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DashboardPermission"
            ("DashboardID", "UserID", "CanRead", "CanEdit", "CanDelete", "CanShare", "SharedByUserID")
        VALUES
            (p_DashboardID, p_UserID, p_CanRead, p_CanEdit, p_CanDelete, p_CanShare, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboardPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateActionLibrary"(IN p_ActionID UUID, IN p_LibraryID UUID, IN p_ItemsUsed TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwActionLibraries" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ActionLibrary"
            ("ID", "ActionID", "LibraryID", "ItemsUsed")
        VALUES
            (p_ID, p_ActionID, p_LibraryID, p_ItemsUsed)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ActionLibrary"
            ("ActionID", "LibraryID", "ItemsUsed")
        VALUES
            (p_ActionID, p_LibraryID, p_ItemsUsed)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwActionLibraries" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIVendor"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_CredentialTypeID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIVendors" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIVendor"
            ("ID", "Name", "Description", "CredentialTypeID")
        VALUES
            (p_ID, p_Name, p_Description, p_CredentialTypeID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIVendor"
            ("Name", "Description", "CredentialTypeID")
        VALUES
            (p_Name, p_Description, p_CredentialTypeID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIVendors" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledJobType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255), IN p_DomainRunEntity VARCHAR(255), IN p_DomainRunEntityFKey VARCHAR(100), IN p_NotificationsAvailable BOOLEAN)
RETURNS SETOF __mj."vwScheduledJobTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ScheduledJobType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "DomainRunEntity" = p_DomainRunEntity,
        "DomainRunEntityFKey" = p_DomainRunEntityFKey,
        "NotificationsAvailable" = p_NotificationsAvailable
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwScheduledJobTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntity"(IN p_ID UUID, IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_NameSuffix VARCHAR(255), IN p_Description TEXT, IN p_AutoUpdateDescription BOOLEAN, IN p_BaseView VARCHAR(255), IN p_BaseViewGenerated BOOLEAN, IN p_VirtualEntity BOOLEAN, IN p_TrackRecordChanges BOOLEAN, IN p_AuditRecordAccess BOOLEAN, IN p_AuditViewRuns BOOLEAN, IN p_IncludeInAPI BOOLEAN, IN p_AllowAllRowsAPI BOOLEAN, IN p_AllowUpdateAPI BOOLEAN, IN p_AllowCreateAPI BOOLEAN, IN p_AllowDeleteAPI BOOLEAN, IN p_CustomResolverAPI BOOLEAN, IN p_AllowUserSearchAPI BOOLEAN, IN p_FullTextSearchEnabled BOOLEAN, IN p_FullTextCatalog VARCHAR(255), IN p_FullTextCatalogGenerated BOOLEAN, IN p_FullTextIndex VARCHAR(255), IN p_FullTextIndexGenerated BOOLEAN, IN p_FullTextSearchFunction VARCHAR(255), IN p_FullTextSearchFunctionGenerated BOOLEAN, IN p_UserViewMaxRows INTEGER, IN p_spCreate VARCHAR(255), IN p_spUpdate VARCHAR(255), IN p_spDelete VARCHAR(255), IN p_spCreateGenerated BOOLEAN, IN p_spUpdateGenerated BOOLEAN, IN p_spDeleteGenerated BOOLEAN, IN p_CascadeDeletes BOOLEAN, IN p_DeleteType VARCHAR(10), IN p_AllowRecordMerge BOOLEAN, IN p_spMatch VARCHAR(255), IN p_RelationshipDefaultDisplayType VARCHAR(20), IN p_UserFormGenerated BOOLEAN, IN p_EntityObjectSubclassName VARCHAR(255), IN p_EntityObjectSubclassImport VARCHAR(255), IN p_PreferredCommunicationField VARCHAR(255), IN p_Icon VARCHAR(500), IN p_ScopeDefault VARCHAR(100), IN p_RowsToPackWithSchema VARCHAR(20), IN p_RowsToPackSampleMethod VARCHAR(20), IN p_RowsToPackSampleCount INTEGER, IN p_RowsToPackSampleOrder TEXT, IN p_AutoRowCountFrequency INTEGER, IN p_RowCount BIGINT, IN p_RowCountRunAt TIMESTAMPTZ, IN p_Status VARCHAR(25), IN p_DisplayName VARCHAR(255))
RETURNS SETOF __mj."vwEntities" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRole"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_DirectoryID VARCHAR(250), IN p_SQLName VARCHAR(250))
RETURNS SETOF __mj."vwRoles" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Role"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DirectoryID" = p_DirectoryID,
        "SQLName" = p_SQLName
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRoles" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentArtifactType"(IN p_ID UUID, IN p_AgentID UUID, IN p_ArtifactTypeID UUID, IN p_Sequence INTEGER)
RETURNS SETOF __mj."vwAIAgentArtifactTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentArtifactType"
    SET
        "AgentID" = p_AgentID,
        "ArtifactTypeID" = p_ArtifactTypeID,
        "Sequence" = p_Sequence
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentArtifactTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardPermission"(IN p_ID UUID, IN p_DashboardID UUID, IN p_UserID UUID, IN p_CanRead BOOLEAN, IN p_CanEdit BOOLEAN, IN p_CanDelete BOOLEAN, IN p_CanShare BOOLEAN, IN p_SharedByUserID UUID)
RETURNS SETOF __mj."vwDashboardPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DashboardPermission"
    SET
        "DashboardID" = p_DashboardID,
        "UserID" = p_UserID,
        "CanRead" = p_CanRead,
        "CanEdit" = p_CanEdit,
        "CanDelete" = p_CanDelete,
        "CanShare" = p_CanShare,
        "SharedByUserID" = p_SharedByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboardPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactUse"(IN p_ArtifactVersionID UUID, IN p_UserID UUID, IN p_UsageType VARCHAR(20), IN p_UsageContext TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwArtifactUses" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ArtifactUse"
            ("ID", "ArtifactVersionID", "UserID", "UsageType", "UsageContext")
        VALUES
            (p_ID, p_ArtifactVersionID, p_UserID, p_UsageType, p_UsageContext)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ArtifactUse"
            ("ArtifactVersionID", "UserID", "UsageType", "UsageContext")
        VALUES
            (p_ArtifactVersionID, p_UserID, p_UsageType, p_UsageContext)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwArtifactUses" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTemplateCategory"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID)
RETURNS SETOF __mj."vwTemplateCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAuditLog"(IN p_UserID UUID, IN p_AuditLogTypeID UUID, IN p_AuthorizationID UUID, IN p_Description TEXT, IN p_Details TEXT, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwAuditLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AuditLog"
            ("ID", "UserID", "AuditLogTypeID", "AuthorizationID", "Status", "Description", "Details", "EntityID", "RecordID")
        VALUES
            (p_ID, p_UserID, p_AuditLogTypeID, p_AuthorizationID, p_Status, p_Description, p_Details, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AuditLog"
            ("UserID", "AuditLogTypeID", "AuthorizationID", "Status", "Description", "Details", "EntityID", "RecordID")
        VALUES
            (p_UserID, p_AuditLogTypeID, p_AuthorizationID, p_Status, p_Description, p_Details, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAuditLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CommunicationRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactVersionAttribute"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ArtifactVersionAttribute"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDataset"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Dataset"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserApplicationEntity"(IN p_ID UUID, IN p_UserApplicationID UUID, IN p_EntityID UUID, IN p_Sequence INTEGER)
RETURNS SETOF __mj."vwUserApplicationEntities" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserApplicationEntity"
    SET
        "UserApplicationID" = p_UserApplicationID,
        "EntityID" = p_EntityID,
        "Sequence" = p_Sequence
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserApplicationEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardUserPreference"(IN p_ID UUID, IN p_UserID UUID, IN p_DashboardID UUID, IN p_Scope VARCHAR(20), IN p_ApplicationID UUID, IN p_DisplayOrder INTEGER)
RETURNS SETOF __mj."vwDashboardUserPreferences" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DashboardUserPreference"
    SET
        "UserID" = p_UserID,
        "DashboardID" = p_DashboardID,
        "Scope" = p_Scope,
        "ApplicationID" = p_ApplicationID,
        "DisplayOrder" = p_DisplayOrder
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDashboardUserPreferences" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecommendationItem"(IN p_ID UUID, IN p_RecommendationID UUID, IN p_DestinationEntityID UUID, IN p_DestinationEntityRecordID VARCHAR(450), IN p_MatchProbability NUMERIC(18,15))
RETURNS SETOF __mj."vwRecommendationItems" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecommendationItem"
    SET
        "RecommendationID" = p_RecommendationID,
        "DestinationEntityID" = p_DestinationEntityID,
        "DestinationEntityRecordID" = p_DestinationEntityRecordID,
        "MatchProbability" = p_MatchProbability
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecommendationItems" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionContextType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwActionContextTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionContextType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionContextTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateComponentDependency"(IN p_ID UUID, IN p_ComponentID UUID, IN p_DependencyComponentID UUID)
RETURNS SETOF __mj."vwComponentDependencies" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ComponentDependency"
    SET
        "ComponentID" = p_ComponentID,
        "DependencyComponentID" = p_DependencyComponentID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwComponentDependencies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVersionInstallation"(IN p_ID UUID, IN p_MajorVersion INTEGER, IN p_MinorVersion INTEGER, IN p_PatchVersion INTEGER, IN p_Type VARCHAR(20), IN p_InstalledAt TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_InstallLog TEXT, IN p_Comments TEXT)
RETURNS SETOF __mj."vwVersionInstallations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."VersionInstallation"
    SET
        "MajorVersion" = p_MajorVersion,
        "MinorVersion" = p_MinorVersion,
        "PatchVersion" = p_PatchVersion,
        "Type" = p_Type,
        "InstalledAt" = p_InstalledAt,
        "Status" = p_Status,
        "InstallLog" = p_InstallLog,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwVersionInstallations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDashboardPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DashboardPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueryParameter"(IN p_ID UUID, IN p_QueryID UUID, IN p_Name VARCHAR(255), IN p_Type VARCHAR(50), IN p_IsRequired BOOLEAN, IN p_DefaultValue TEXT, IN p_Description TEXT, IN p_SampleValue TEXT, IN p_ValidationFilters TEXT, IN p_DetectionMethod VARCHAR(50), IN p_AutoDetectConfidenceScore NUMERIC(3,2))
RETURNS SETOF __mj."vwQueryParameters" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."QueryParameter"
    SET
        "QueryID" = p_QueryID,
        "Name" = p_Name,
        "Type" = p_Type,
        "IsRequired" = p_IsRequired,
        "DefaultValue" = p_DefaultValue,
        "Description" = p_Description,
        "SampleValue" = p_SampleValue,
        "ValidationFilters" = p_ValidationFilters,
        "DetectionMethod" = p_DetectionMethod,
        "AutoDetectConfidenceScore" = p_AutoDetectConfidenceScore
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueryParameters" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendationItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecommendationItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateListShare"(IN p_ListID UUID, IN p_UserID UUID, IN p_Role VARCHAR(50), IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwListShares" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ListShare"
            ("ID", "ListID", "UserID", "Role", "Status")
        VALUES
            (p_ID, p_ListID, p_UserID, p_Role, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ListShare"
            ("ListID", "UserID", "Role", "Status")
        VALUES
            (p_ListID, p_UserID, p_Role, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwListShares" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueryCategory"(IN p_Name VARCHAR(50), IN p_ParentID UUID, IN p_Description TEXT, IN p_UserID UUID, IN p_DefaultCacheTTLMinutes INTEGER, IN p_DefaultCacheMaxSize INTEGER, IN p_ID UUID DEFAULT NULL, IN p_DefaultCacheEnabled BOOLEAN DEFAULT NULL, IN p_CacheInheritanceEnabled BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwQueryCategories" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueryCategory"
            ("ID", "Name", "ParentID", "Description", "UserID", "DefaultCacheEnabled", "DefaultCacheTTLMinutes", "DefaultCacheMaxSize", "CacheInheritanceEnabled")
        VALUES
            (p_ID, p_Name, p_ParentID, p_Description, p_UserID, p_DefaultCacheEnabled, p_DefaultCacheTTLMinutes, p_DefaultCacheMaxSize, p_CacheInheritanceEnabled)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueryCategory"
            ("Name", "ParentID", "Description", "UserID", "DefaultCacheEnabled", "DefaultCacheTTLMinutes", "DefaultCacheMaxSize", "CacheInheritanceEnabled")
        VALUES
            (p_Name, p_ParentID, p_Description, p_UserID, p_DefaultCacheEnabled, p_DefaultCacheTTLMinutes, p_DefaultCacheMaxSize, p_CacheInheritanceEnabled)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueryCategories" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRowLevelSecurityFilter"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RowLevelSecurityFilter"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationURLFormat"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."IntegrationURLFormat"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOutputDeliveryType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."OutputDeliveryType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentStepPath"(IN p_ID UUID, IN p_OriginStepID UUID, IN p_DestinationStepID UUID, IN p_Condition TEXT, IN p_Priority INTEGER, IN p_Description VARCHAR(255), IN p_PathPoints TEXT)
RETURNS SETOF __mj."vwAIAgentStepPaths" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentStepPath"
    SET
        "OriginStepID" = p_OriginStepID,
        "DestinationStepID" = p_DestinationStepID,
        "Condition" = p_Condition,
        "Priority" = p_Priority,
        "Description" = p_Description,
        "PathPoints" = p_PathPoints
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentStepPaths" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionFilter"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionFilter"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRunDetailMatch"(IN p_ID UUID, IN p_DuplicateRunDetailID UUID, IN p_MatchSource VARCHAR(20), IN p_MatchRecordID VARCHAR(500), IN p_MatchProbability NUMERIC(12,11), IN p_MatchedAt TIMESTAMPTZ, IN p_Action VARCHAR(20), IN p_ApprovalStatus VARCHAR(20), IN p_RecordMergeLogID UUID, IN p_MergeStatus VARCHAR(20), IN p_MergedAt TIMESTAMPTZ)
RETURNS SETOF __mj."vwDuplicateRunDetailMatches" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."DuplicateRunDetailMatch"
    SET
        "DuplicateRunDetailID" = p_DuplicateRunDetailID,
        "MatchSource" = p_MatchSource,
        "MatchRecordID" = p_MatchRecordID,
        "MatchProbability" = p_MatchProbability,
        "MatchedAt" = p_MatchedAt,
        "Action" = p_Action,
        "ApprovalStatus" = p_ApprovalStatus,
        "RecordMergeLogID" = p_RecordMergeLogID,
        "MergeStatus" = p_MergeStatus,
        "MergedAt" = p_MergedAt
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetailMatches" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestRun"(IN p_TestID UUID, IN p_TestSuiteRunID UUID, IN p_RunByUserID UUID, IN p_Sequence INTEGER, IN p_TargetType VARCHAR(100), IN p_TargetLogID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_DurationSeconds NUMERIC(10,3), IN p_InputData TEXT, IN p_ExpectedOutputData TEXT, IN p_ActualOutputData TEXT, IN p_PassedChecks INTEGER, IN p_FailedChecks INTEGER, IN p_TotalChecks INTEGER, IN p_Score NUMERIC(5,4), IN p_CostUSD NUMERIC(10,6), IN p_ErrorMessage TEXT, IN p_ResultDetails TEXT, IN p_Log TEXT, IN p_Tags TEXT, IN p_MachineName VARCHAR(255), IN p_MachineID VARCHAR(255), IN p_RunByUserName VARCHAR(255), IN p_RunByUserEmail VARCHAR(255), IN p_RunContextDetails TEXT, IN p_TargetLogEntityID UUID, IN p_ResolvedVariables TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwTestRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestRun"
            ("ID", "TestID", "TestSuiteRunID", "RunByUserID", "Sequence", "TargetType", "TargetLogID", "Status", "StartedAt", "CompletedAt", "DurationSeconds", "InputData", "ExpectedOutputData", "ActualOutputData", "PassedChecks", "FailedChecks", "TotalChecks", "Score", "CostUSD", "ErrorMessage", "ResultDetails", "Log", "Tags", "MachineName", "MachineID", "RunByUserName", "RunByUserEmail", "RunContextDetails", "TargetLogEntityID", "ResolvedVariables")
        VALUES
            (p_ID, p_TestID, p_TestSuiteRunID, p_RunByUserID, p_Sequence, p_TargetType, p_TargetLogID, p_Status, p_StartedAt, p_CompletedAt, p_DurationSeconds, p_InputData, p_ExpectedOutputData, p_ActualOutputData, p_PassedChecks, p_FailedChecks, p_TotalChecks, p_Score, p_CostUSD, p_ErrorMessage, p_ResultDetails, p_Log, p_Tags, p_MachineName, p_MachineID, p_RunByUserName, p_RunByUserEmail, p_RunContextDetails, p_TargetLogEntityID, p_ResolvedVariables)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestRun"
            ("TestID", "TestSuiteRunID", "RunByUserID", "Sequence", "TargetType", "TargetLogID", "Status", "StartedAt", "CompletedAt", "DurationSeconds", "InputData", "ExpectedOutputData", "ActualOutputData", "PassedChecks", "FailedChecks", "TotalChecks", "Score", "CostUSD", "ErrorMessage", "ResultDetails", "Log", "Tags", "MachineName", "MachineID", "RunByUserName", "RunByUserEmail", "RunContextDetails", "TargetLogEntityID", "ResolvedVariables")
        VALUES
            (p_TestID, p_TestSuiteRunID, p_RunByUserID, p_Sequence, p_TargetType, p_TargetLogID, p_Status, p_StartedAt, p_CompletedAt, p_DurationSeconds, p_InputData, p_ExpectedOutputData, p_ActualOutputData, p_PassedChecks, p_FailedChecks, p_TotalChecks, p_Score, p_CostUSD, p_ErrorMessage, p_ResultDetails, p_Log, p_Tags, p_MachineName, p_MachineID, p_RunByUserName, p_RunByUserEmail, p_RunContextDetails, p_TargetLogEntityID, p_ResolvedVariables)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateMCPServerTool"(IN p_MCPServerID UUID, IN p_ToolName VARCHAR(255), IN p_ToolTitle VARCHAR(255), IN p_ToolDescription TEXT, IN p_InputSchema TEXT, IN p_OutputSchema TEXT, IN p_Annotations TEXT, IN p_GeneratedActionID UUID, IN p_GeneratedActionCategoryID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_DiscoveredAt TIMESTAMPTZ DEFAULT NULL, IN p_LastSeenAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwMCPServerTools" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."MCPServerTool"
            ("ID", "MCPServerID", "ToolName", "ToolTitle", "ToolDescription", "InputSchema", "OutputSchema", "Annotations", "Status", "DiscoveredAt", "LastSeenAt", "GeneratedActionID", "GeneratedActionCategoryID")
        VALUES
            (p_ID, p_MCPServerID, p_ToolName, p_ToolTitle, p_ToolDescription, p_InputSchema, p_OutputSchema, p_Annotations, p_Status, p_DiscoveredAt, p_LastSeenAt, p_GeneratedActionID, p_GeneratedActionCategoryID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."MCPServerTool"
            ("MCPServerID", "ToolName", "ToolTitle", "ToolDescription", "InputSchema", "OutputSchema", "Annotations", "Status", "DiscoveredAt", "LastSeenAt", "GeneratedActionID", "GeneratedActionCategoryID")
        VALUES
            (p_MCPServerID, p_ToolName, p_ToolTitle, p_ToolDescription, p_InputSchema, p_OutputSchema, p_Annotations, p_Status, p_DiscoveredAt, p_LastSeenAt, p_GeneratedActionID, p_GeneratedActionCategoryID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerTools" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCollection"(IN p_ID UUID, IN p_EnvironmentID UUID, IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Icon VARCHAR(50), IN p_Color VARCHAR(7), IN p_Sequence INTEGER, IN p_OwnerID UUID)
RETURNS SETOF __mj."vwCollections" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocumentSetting"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityDocumentSetting"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserViewRunDetail"(IN p_ID UUID, IN p_UserViewRunID UUID, IN p_RecordID VARCHAR(450))
RETURNS SETOF __mj."vwUserViewRunDetails" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserViewRunDetail"
    SET
        "UserViewRunID" = p_UserViewRunID,
        "RecordID" = p_RecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserViewRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestRun"(IN p_ID UUID, IN p_TestID UUID, IN p_TestSuiteRunID UUID, IN p_RunByUserID UUID, IN p_Sequence INTEGER, IN p_TargetType VARCHAR(100), IN p_TargetLogID UUID, IN p_Status VARCHAR(20), IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_DurationSeconds NUMERIC(10,3), IN p_InputData TEXT, IN p_ExpectedOutputData TEXT, IN p_ActualOutputData TEXT, IN p_PassedChecks INTEGER, IN p_FailedChecks INTEGER, IN p_TotalChecks INTEGER, IN p_Score NUMERIC(5,4), IN p_CostUSD NUMERIC(10,6), IN p_ErrorMessage TEXT, IN p_ResultDetails TEXT, IN p_Log TEXT, IN p_Tags TEXT, IN p_MachineName VARCHAR(255), IN p_MachineID VARCHAR(255), IN p_RunByUserName VARCHAR(255), IN p_RunByUserEmail VARCHAR(255), IN p_RunContextDetails TEXT, IN p_TargetLogEntityID UUID, IN p_ResolvedVariables TEXT)
RETURNS SETOF __mj."vwTestRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TestRun"
    SET
        "TestID" = p_TestID,
        "TestSuiteRunID" = p_TestSuiteRunID,
        "RunByUserID" = p_RunByUserID,
        "Sequence" = p_Sequence,
        "TargetType" = p_TargetType,
        "TargetLogID" = p_TargetLogID,
        "Status" = p_Status,
        "StartedAt" = p_StartedAt,
        "CompletedAt" = p_CompletedAt,
        "DurationSeconds" = p_DurationSeconds,
        "InputData" = p_InputData,
        "ExpectedOutputData" = p_ExpectedOutputData,
        "ActualOutputData" = p_ActualOutputData,
        "PassedChecks" = p_PassedChecks,
        "FailedChecks" = p_FailedChecks,
        "TotalChecks" = p_TotalChecks,
        "Score" = p_Score,
        "CostUSD" = p_CostUSD,
        "ErrorMessage" = p_ErrorMessage,
        "ResultDetails" = p_ResultDetails,
        "Log" = p_Log,
        "Tags" = p_Tags,
        "MachineName" = p_MachineName,
        "MachineID" = p_MachineID,
        "RunByUserName" = p_RunByUserName,
        "RunByUserEmail" = p_RunByUserEmail,
        "RunContextDetails" = p_RunContextDetails,
        "TargetLogEntityID" = p_TargetLogEntityID,
        "ResolvedVariables" = p_ResolvedVariables
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTestRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSourceParam"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentSourceParam"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateMCPServerTool"(IN p_ID UUID, IN p_MCPServerID UUID, IN p_ToolName VARCHAR(255), IN p_ToolTitle VARCHAR(255), IN p_ToolDescription TEXT, IN p_InputSchema TEXT, IN p_OutputSchema TEXT, IN p_Annotations TEXT, IN p_Status VARCHAR(50), IN p_DiscoveredAt TIMESTAMPTZ, IN p_LastSeenAt TIMESTAMPTZ, IN p_GeneratedActionID UUID, IN p_GeneratedActionCategoryID UUID)
RETURNS SETOF __mj."vwMCPServerTools" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."MCPServerTool"
    SET
        "MCPServerID" = p_MCPServerID,
        "ToolName" = p_ToolName,
        "ToolTitle" = p_ToolTitle,
        "ToolDescription" = p_ToolDescription,
        "InputSchema" = p_InputSchema,
        "OutputSchema" = p_OutputSchema,
        "Annotations" = p_Annotations,
        "Status" = p_Status,
        "DiscoveredAt" = p_DiscoveredAt,
        "LastSeenAt" = p_LastSeenAt,
        "GeneratedActionID" = p_GeneratedActionID,
        "GeneratedActionCategoryID" = p_GeneratedActionCategoryID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerTools" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationBaseMessageType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CommunicationBaseMessageType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityAction"(IN p_EntityID UUID, IN p_ActionID UUID, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityActions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityAction"
            ("ID", "EntityID", "ActionID", "Status")
        VALUES
            (p_ID, p_EntityID, p_ActionID, p_Status)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityAction"
            ("EntityID", "ActionID", "Status")
        VALUES
            (p_EntityID, p_ActionID, p_Status)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityActions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTaskType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwTaskTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TaskType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTaskTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserRecordLog"(IN p_ID UUID, IN p_UserID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_EarliestAt TIMESTAMPTZ, IN p_LatestAt TIMESTAMPTZ, IN p_TotalCount INTEGER)
RETURNS SETOF __mj."vwUserRecordLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."UserRecordLog"
    SET
        "UserID" = p_UserID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "EarliestAt" = p_EarliestAt,
        "LatestAt" = p_LatestAt,
        "TotalCount" = p_TotalCount
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwUserRecordLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

-- SKIPPED utility procedure: spCreateUserViewRunWithDetail (needs manual rewrite for PostgreSQL)

CREATE OR REPLACE FUNCTION __mj."spCreateFileEntityRecordLink"(IN p_FileID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(750), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwFileEntityRecordLinks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."FileEntityRecordLink"
            ("ID", "FileID", "EntityID", "RecordID")
        VALUES
            (p_ID, p_FileID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."FileEntityRecordLink"
            ("FileID", "EntityID", "RecordID")
        VALUES
            (p_FileID, p_EntityID, p_RecordID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwFileEntityRecordLinks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAction"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Action"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModel"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIModel"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TestRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerTool"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."MCPServerTool"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordChangeReplayRun"(IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Status VARCHAR(50), IN p_UserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRecordChangeReplayRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecordChangeReplayRun"
            ("ID", "StartedAt", "EndedAt", "Status", "UserID")
        VALUES
            (p_ID, p_StartedAt, p_EndedAt, p_Status, p_UserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecordChangeReplayRun"
            ("StartedAt", "EndedAt", "Status", "UserID")
        VALUES
            (p_StartedAt, p_EndedAt, p_Status, p_UserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecordChangeReplayRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIVendor"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_CredentialTypeID UUID)
RETURNS SETOF __mj."vwAIVendors" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIVendor"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "CredentialTypeID" = p_CredentialTypeID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIVendors" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversation"(IN p_UserID UUID, IN p_ExternalID VARCHAR(500), IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_LinkedEntityID UUID, IN p_LinkedRecordID VARCHAR(500), IN p_DataContextID UUID, IN p_ProjectID UUID, IN p_TestRunID UUID, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(50) DEFAULT NULL, IN p_IsArchived BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_EnvironmentID UUID DEFAULT NULL, IN p_IsPinned BOOLEAN DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Conversation"
            ("ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID")
        VALUES
            (p_ID, p_UserID, p_ExternalID, p_Name, p_Description, p_Type, p_IsArchived, p_LinkedEntityID, p_LinkedRecordID, p_DataContextID, p_Status, p_EnvironmentID, p_ProjectID, p_IsPinned, p_TestRunID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Conversation" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIPromptTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPromptType"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPromptType"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateArtifact"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_TypeID UUID, IN p_Comments TEXT, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL, IN p_EnvironmentID UUID DEFAULT NULL, IN p_Visibility VARCHAR(20) DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Artifact"
            ("ID", "EnvironmentID", "Name", "Description", "TypeID", "Comments", "UserID", "Visibility")
        VALUES
            (p_ID, p_EnvironmentID, p_Name, p_Description, p_TypeID, p_Comments, p_UserID, p_Visibility)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Artifact" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAuditLog"(IN p_ID UUID, IN p_UserID UUID, IN p_AuditLogTypeID UUID, IN p_AuthorizationID UUID, IN p_Status VARCHAR(50), IN p_Description TEXT, IN p_Details TEXT, IN p_EntityID UUID, IN p_RecordID VARCHAR(450))
RETURNS SETOF __mj."vwAuditLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AuditLog"
    SET
        "UserID" = p_UserID,
        "AuditLogTypeID" = p_AuditLogTypeID,
        "AuthorizationID" = p_AuthorizationID,
        "Status" = p_Status,
        "Description" = p_Description,
        "Details" = p_Details,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAuditLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIPromptCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityRelationshipDisplayComponent"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_RelationshipType VARCHAR(20), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEntityRelationshipDisplayComponents" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityRelationshipDisplayComponent"
            ("ID", "Name", "Description", "RelationshipType")
        VALUES
            (p_ID, p_Name, p_Description, p_RelationshipType)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityRelationshipDisplayComponent"
            ("Name", "Description", "RelationshipType")
        VALUES
            (p_Name, p_Description, p_RelationshipType)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityRelationshipDisplayComponents" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDataset"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwDatasets" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Dataset"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Dataset"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDatasets" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestSuiteRun"(IN p_SuiteID UUID, IN p_RunByUserID UUID, IN p_Environment VARCHAR(50), IN p_TriggerType VARCHAR(50), IN p_GitCommit VARCHAR(100), IN p_AgentVersion VARCHAR(100), IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_TotalTests INTEGER, IN p_PassedTests INTEGER, IN p_FailedTests INTEGER, IN p_SkippedTests INTEGER, IN p_ErrorTests INTEGER, IN p_TotalDurationSeconds NUMERIC(10,3), IN p_TotalCostUSD NUMERIC(10,6), IN p_Configuration TEXT, IN p_ResultSummary TEXT, IN p_ErrorMessage TEXT, IN p_Tags TEXT, IN p_MachineName VARCHAR(255), IN p_MachineID VARCHAR(255), IN p_RunByUserName VARCHAR(255), IN p_RunByUserEmail VARCHAR(255), IN p_RunContextDetails TEXT, IN p_ResolvedVariables TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwTestSuiteRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestSuiteRun"
            ("ID", "SuiteID", "RunByUserID", "Environment", "TriggerType", "GitCommit", "AgentVersion", "Status", "StartedAt", "CompletedAt", "TotalTests", "PassedTests", "FailedTests", "SkippedTests", "ErrorTests", "TotalDurationSeconds", "TotalCostUSD", "Configuration", "ResultSummary", "ErrorMessage", "Tags", "MachineName", "MachineID", "RunByUserName", "RunByUserEmail", "RunContextDetails", "ResolvedVariables")
        VALUES
            (p_ID, p_SuiteID, p_RunByUserID, p_Environment, p_TriggerType, p_GitCommit, p_AgentVersion, p_Status, p_StartedAt, p_CompletedAt, p_TotalTests, p_PassedTests, p_FailedTests, p_SkippedTests, p_ErrorTests, p_TotalDurationSeconds, p_TotalCostUSD, p_Configuration, p_ResultSummary, p_ErrorMessage, p_Tags, p_MachineName, p_MachineID, p_RunByUserName, p_RunByUserEmail, p_RunContextDetails, p_ResolvedVariables)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestSuiteRun"
            ("SuiteID", "RunByUserID", "Environment", "TriggerType", "GitCommit", "AgentVersion", "Status", "StartedAt", "CompletedAt", "TotalTests", "PassedTests", "FailedTests", "SkippedTests", "ErrorTests", "TotalDurationSeconds", "TotalCostUSD", "Configuration", "ResultSummary", "ErrorMessage", "Tags", "MachineName", "MachineID", "RunByUserName", "RunByUserEmail", "RunContextDetails", "ResolvedVariables")
        VALUES
            (p_SuiteID, p_RunByUserID, p_Environment, p_TriggerType, p_GitCommit, p_AgentVersion, p_Status, p_StartedAt, p_CompletedAt, p_TotalTests, p_PassedTests, p_FailedTests, p_SkippedTests, p_ErrorTests, p_TotalDurationSeconds, p_TotalCostUSD, p_Configuration, p_ResultSummary, p_ErrorMessage, p_Tags, p_MachineName, p_MachineID, p_RunByUserName, p_RunByUserEmail, p_RunContextDetails, p_ResolvedVariables)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestSuiteRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboardCategory"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwDashboardCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateMCPToolExecutionLog"(IN p_MCPServerConnectionID UUID, IN p_MCPServerToolID UUID, IN p_ToolName VARCHAR(255), IN p_UserID UUID, IN p_EndedAt TIMESTAMPTZ, IN p_DurationMs INTEGER, IN p_ErrorMessage TEXT, IN p_InputParameters TEXT, IN p_OutputContent TEXT, IN p_ID UUID DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL, IN p_Success BOOLEAN DEFAULT NULL, IN p_OutputTruncated BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwMCPToolExecutionLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."MCPToolExecutionLog"
            ("ID", "MCPServerConnectionID", "MCPServerToolID", "ToolName", "UserID", "StartedAt", "EndedAt", "DurationMs", "Success", "ErrorMessage", "InputParameters", "OutputContent", "OutputTruncated")
        VALUES
            (p_ID, p_MCPServerConnectionID, p_MCPServerToolID, p_ToolName, p_UserID, p_StartedAt, p_EndedAt, p_DurationMs, p_Success, p_ErrorMessage, p_InputParameters, p_OutputContent, p_OutputTruncated)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."MCPToolExecutionLog"
            ("MCPServerConnectionID", "MCPServerToolID", "ToolName", "UserID", "StartedAt", "EndedAt", "DurationMs", "Success", "ErrorMessage", "InputParameters", "OutputContent", "OutputTruncated")
        VALUES
            (p_MCPServerConnectionID, p_MCPServerToolID, p_ToolName, p_UserID, p_StartedAt, p_EndedAt, p_DurationMs, p_Success, p_ErrorMessage, p_InputParameters, p_OutputContent, p_OutputTruncated)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwMCPToolExecutionLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentTypeAttribute"(IN p_ContentTypeID UUID, IN p_Name VARCHAR(100), IN p_Prompt TEXT, IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentTypeAttributes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentTypeAttribute"
            ("ID", "ContentTypeID", "Name", "Prompt", "Description")
        VALUES
            (p_ID, p_ContentTypeID, p_Name, p_Prompt, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentTypeAttribute"
            ("ContentTypeID", "Name", "Prompt", "Description")
        VALUES
            (p_ContentTypeID, p_Name, p_Prompt, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentTypeAttributes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelVendor"(IN p_ModelID UUID, IN p_VendorID UUID, IN p_DriverClass VARCHAR(100), IN p_DriverImportPath VARCHAR(255), IN p_APIName VARCHAR(100), IN p_MaxInputTokens INTEGER, IN p_MaxOutputTokens INTEGER, IN p_TypeID UUID, IN p_ID UUID DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_SupportedResponseFormats VARCHAR(100) DEFAULT NULL, IN p_SupportsEffortLevel BOOLEAN DEFAULT NULL, IN p_SupportsStreaming BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelVendors" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelVendor"
            ("ID", "ModelID", "VendorID", "Priority", "Status", "DriverClass", "DriverImportPath", "APIName", "MaxInputTokens", "MaxOutputTokens", "SupportedResponseFormats", "SupportsEffortLevel", "SupportsStreaming", "TypeID")
        VALUES
            (p_ID, p_ModelID, p_VendorID, p_Priority, p_Status, p_DriverClass, p_DriverImportPath, p_APIName, p_MaxInputTokens, p_MaxOutputTokens, p_SupportedResponseFormats, p_SupportsEffortLevel, p_SupportsStreaming, p_TypeID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelVendor"
            ("ModelID", "VendorID", "Priority", "Status", "DriverClass", "DriverImportPath", "APIName", "MaxInputTokens", "MaxOutputTokens", "SupportedResponseFormats", "SupportsEffortLevel", "SupportsStreaming", "TypeID")
        VALUES
            (p_ModelID, p_VendorID, p_Priority, p_Status, p_DriverClass, p_DriverImportPath, p_APIName, p_MaxInputTokens, p_MaxOutputTokens, p_SupportedResponseFormats, p_SupportsEffortLevel, p_SupportsStreaming, p_TypeID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueryCategory"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_ParentID UUID, IN p_Description TEXT, IN p_UserID UUID, IN p_DefaultCacheEnabled BOOLEAN, IN p_DefaultCacheTTLMinutes INTEGER, IN p_DefaultCacheMaxSize INTEGER, IN p_CacheInheritanceEnabled BOOLEAN)
RETURNS SETOF __mj."vwQueryCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionLibrary"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionLibrary"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestSuiteRun"(IN p_ID UUID, IN p_SuiteID UUID, IN p_RunByUserID UUID, IN p_Environment VARCHAR(50), IN p_TriggerType VARCHAR(50), IN p_GitCommit VARCHAR(100), IN p_AgentVersion VARCHAR(100), IN p_Status VARCHAR(20), IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_TotalTests INTEGER, IN p_PassedTests INTEGER, IN p_FailedTests INTEGER, IN p_SkippedTests INTEGER, IN p_ErrorTests INTEGER, IN p_TotalDurationSeconds NUMERIC(10,3), IN p_TotalCostUSD NUMERIC(10,6), IN p_Configuration TEXT, IN p_ResultSummary TEXT, IN p_ErrorMessage TEXT, IN p_Tags TEXT, IN p_MachineName VARCHAR(255), IN p_MachineID VARCHAR(255), IN p_RunByUserName VARCHAR(255), IN p_RunByUserEmail VARCHAR(255), IN p_RunContextDetails TEXT, IN p_ResolvedVariables TEXT)
RETURNS SETOF __mj."vwTestSuiteRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TestSuiteRun"
    SET
        "SuiteID" = p_SuiteID,
        "RunByUserID" = p_RunByUserID,
        "Environment" = p_Environment,
        "TriggerType" = p_TriggerType,
        "GitCommit" = p_GitCommit,
        "AgentVersion" = p_AgentVersion,
        "Status" = p_Status,
        "StartedAt" = p_StartedAt,
        "CompletedAt" = p_CompletedAt,
        "TotalTests" = p_TotalTests,
        "PassedTests" = p_PassedTests,
        "FailedTests" = p_FailedTests,
        "SkippedTests" = p_SkippedTests,
        "ErrorTests" = p_ErrorTests,
        "TotalDurationSeconds" = p_TotalDurationSeconds,
        "TotalCostUSD" = p_TotalCostUSD,
        "Configuration" = p_Configuration,
        "ResultSummary" = p_ResultSummary,
        "ErrorMessage" = p_ErrorMessage,
        "Tags" = p_Tags,
        "MachineName" = p_MachineName,
        "MachineID" = p_MachineID,
        "RunByUserName" = p_RunByUserName,
        "RunByUserEmail" = p_RunByUserEmail,
        "RunContextDetails" = p_RunContextDetails,
        "ResolvedVariables" = p_ResolvedVariables
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTestSuiteRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactUse"(IN p_ID UUID, IN p_ArtifactVersionID UUID, IN p_UserID UUID, IN p_UsageType VARCHAR(20), IN p_UsageContext TEXT)
RETURNS SETOF __mj."vwArtifactUses" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ArtifactUse"
    SET
        "ArtifactVersionID" = p_ArtifactVersionID,
        "UserID" = p_UserID,
        "UsageType" = p_UsageType,
        "UsageContext" = p_UsageContext
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwArtifactUses" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateMCPToolExecutionLog"(IN p_ID UUID, IN p_MCPServerConnectionID UUID, IN p_MCPServerToolID UUID, IN p_ToolName VARCHAR(255), IN p_UserID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_DurationMs INTEGER, IN p_Success BOOLEAN, IN p_ErrorMessage TEXT, IN p_InputParameters TEXT, IN p_OutputContent TEXT, IN p_OutputTruncated BOOLEAN)
RETURNS SETOF __mj."vwMCPToolExecutionLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."MCPToolExecutionLog"
    SET
        "MCPServerConnectionID" = p_MCPServerConnectionID,
        "MCPServerToolID" = p_MCPServerToolID,
        "ToolName" = p_ToolName,
        "UserID" = p_UserID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "DurationMs" = p_DurationMs,
        "Success" = p_Success,
        "ErrorMessage" = p_ErrorMessage,
        "InputParameters" = p_InputParameters,
        "OutputContent" = p_OutputContent,
        "OutputTruncated" = p_OutputTruncated
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwMCPToolExecutionLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJob"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ScheduledJob"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateApplication"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Icon VARCHAR(500), IN p_SchemaAutoAddNewEntities TEXT, IN p_Color VARCHAR(20), IN p_DefaultNavItems TEXT, IN p_ClassName VARCHAR(255), IN p_TopNavLocation VARCHAR(30), IN p_Path VARCHAR(100), IN p_ID UUID DEFAULT NULL, IN p_DefaultForNewUser BOOLEAN DEFAULT NULL, IN p_DefaultSequence INTEGER DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_NavigationStyle VARCHAR(20) DEFAULT NULL, IN p_HideNavBarIconWhenActive BOOLEAN DEFAULT NULL, IN p_AutoUpdatePath BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwApplications" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Application"
            ("ID", "Name", "Description", "Icon", "DefaultForNewUser", "SchemaAutoAddNewEntities", "Color", "DefaultNavItems", "ClassName", "DefaultSequence", "Status", "NavigationStyle", "TopNavLocation", "HideNavBarIconWhenActive", "Path", "AutoUpdatePath")
        VALUES
            (p_ID, p_Name, p_Description, p_Icon, p_DefaultForNewUser, p_SchemaAutoAddNewEntities, p_Color, p_DefaultNavItems, p_ClassName, p_DefaultSequence, p_Status, p_NavigationStyle, p_TopNavLocation, p_HideNavBarIconWhenActive, p_Path, p_AutoUpdatePath)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Application"
            ("Name", "Description", "Icon", "DefaultForNewUser", "SchemaAutoAddNewEntities", "Color", "DefaultNavItems", "ClassName", "DefaultSequence", "Status", "NavigationStyle", "TopNavLocation", "HideNavBarIconWhenActive", "Path", "AutoUpdatePath")
        VALUES
            (p_Name, p_Description, p_Icon, p_DefaultForNewUser, p_SchemaAutoAddNewEntities, p_Color, p_DefaultNavItems, p_ClassName, p_DefaultSequence, p_Status, p_NavigationStyle, p_TopNavLocation, p_HideNavBarIconWhenActive, p_Path, p_AutoUpdatePath)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwApplications" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserViewRunDetail"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserViewRunDetail"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledActionParam"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ScheduledActionParam"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateActionLibrary"(IN p_ID UUID, IN p_ActionID UUID, IN p_LibraryID UUID, IN p_ItemsUsed TEXT)
RETURNS SETOF __mj."vwActionLibraries" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ActionLibrary"
    SET
        "ActionID" = p_ActionID,
        "LibraryID" = p_LibraryID,
        "ItemsUsed" = p_ItemsUsed
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwActionLibraries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteGeneratedCodeCategory"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."GeneratedCodeCategory"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

-- SKIPPED utility procedure: spUpdateExistingEntitiesFromSchema (needs manual rewrite for PostgreSQL)

CREATE OR REPLACE FUNCTION __mj."spCreateAPIKey"(IN p_Hash VARCHAR(64), IN p_UserID UUID, IN p_Label VARCHAR(255), IN p_Description VARCHAR(1000), IN p_ExpiresAt TIMESTAMPTZ, IN p_LastUsedAt TIMESTAMPTZ, IN p_CreatedByUserID UUID, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAPIKeys" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIKey"
            ("ID", "Hash", "UserID", "Label", "Description", "Status", "ExpiresAt", "LastUsedAt", "CreatedByUserID")
        VALUES
            (p_ID, p_Hash, p_UserID, p_Label, p_Description, p_Status, p_ExpiresAt, p_LastUsedAt, p_CreatedByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIKey"
            ("Hash", "UserID", "Label", "Description", "Status", "ExpiresAt", "LastUsedAt", "CreatedByUserID")
        VALUES
            (p_Hash, p_UserID, p_Label, p_Description, p_Status, p_ExpiresAt, p_LastUsedAt, p_CreatedByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeys" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentPermission"(IN p_AgentID UUID, IN p_RoleID UUID, IN p_UserID UUID, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_CanView BOOLEAN DEFAULT NULL, IN p_CanRun BOOLEAN DEFAULT NULL, IN p_CanEdit BOOLEAN DEFAULT NULL, IN p_CanDelete BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentPermission"
            ("ID", "AgentID", "RoleID", "UserID", "CanView", "CanRun", "CanEdit", "CanDelete", "Comments")
        VALUES
            (p_ID, p_AgentID, p_RoleID, p_UserID, p_CanView, p_CanRun, p_CanEdit, p_CanDelete, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentPermission"
            ("AgentID", "RoleID", "UserID", "CanView", "CanRun", "CanEdit", "CanDelete", "Comments")
        VALUES
            (p_AgentID, p_RoleID, p_UserID, p_CanView, p_CanRun, p_CanEdit, p_CanDelete, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestSuiteRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TestSuiteRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelModality"(IN p_ModelID UUID, IN p_ModalityID UUID, IN p_Direction VARCHAR(10), IN p_SupportedFormats VARCHAR(500), IN p_MaxSizeBytes INTEGER, IN p_MaxCountPerMessage INTEGER, IN p_MaxDimension INTEGER, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsSupported BOOLEAN DEFAULT NULL, IN p_IsRequired BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIModelModalities" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModelModality"
            ("ID", "ModelID", "ModalityID", "Direction", "IsSupported", "IsRequired", "SupportedFormats", "MaxSizeBytes", "MaxCountPerMessage", "MaxDimension", "Comments")
        VALUES
            (p_ID, p_ModelID, p_ModalityID, p_Direction, p_IsSupported, p_IsRequired, p_SupportedFormats, p_MaxSizeBytes, p_MaxCountPerMessage, p_MaxDimension, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModelModality"
            ("ModelID", "ModalityID", "Direction", "IsSupported", "IsRequired", "SupportedFormats", "MaxSizeBytes", "MaxCountPerMessage", "MaxDimension", "Comments")
        VALUES
            (p_ModelID, p_ModalityID, p_Direction, p_IsSupported, p_IsRequired, p_SupportedFormats, p_MaxSizeBytes, p_MaxCountPerMessage, p_MaxDimension, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModelModalities" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteMCPToolExecutionLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."MCPToolExecutionLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecommendationProvider"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."RecommendationProvider"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityAction"(IN p_EntityID UUID, IN p_ActionID UUID, IN p_Status VARCHAR(20), IN p_ID UUID)
RETURNS SETOF __mj."vwEntityActions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityAction"
    SET
        "EntityID" = p_EntityID,
        "ActionID" = p_ActionID,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityActions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEmployeeCompanyIntegration"(IN p_EmployeeID UUID, IN p_CompanyIntegrationID UUID, IN p_ExternalSystemRecordID VARCHAR(750), IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEmployeeCompanyIntegrations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EmployeeCompanyIntegration"
            ("ID", "EmployeeID", "CompanyIntegrationID", "ExternalSystemRecordID", "IsActive")
        VALUES
            (p_ID, p_EmployeeID, p_CompanyIntegrationID, p_ExternalSystemRecordID, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EmployeeCompanyIntegration"
            ("EmployeeID", "CompanyIntegrationID", "ExternalSystemRecordID", "IsActive")
        VALUES
            (p_EmployeeID, p_CompanyIntegrationID, p_ExternalSystemRecordID, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEmployeeCompanyIntegrations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIKey"(IN p_ID UUID, IN p_Hash VARCHAR(64), IN p_UserID UUID, IN p_Label VARCHAR(255), IN p_Description VARCHAR(1000), IN p_Status VARCHAR(20), IN p_ExpiresAt TIMESTAMPTZ, IN p_LastUsedAt TIMESTAMPTZ, IN p_CreatedByUserID UUID)
RETURNS SETOF __mj."vwAPIKeys" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."APIKey"
    SET
        "Hash" = p_Hash,
        "UserID" = p_UserID,
        "Label" = p_Label,
        "Description" = p_Description,
        "Status" = p_Status,
        "ExpiresAt" = p_ExpiresAt,
        "LastUsedAt" = p_LastUsedAt,
        "CreatedByUserID" = p_CreatedByUserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeys" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRunDetail"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DuplicateRunDetail"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityField"(IN p_DisplayName VARCHAR(255), IN p_Description TEXT, IN p_Category VARCHAR(255), IN p_ExtendedType VARCHAR(50), IN p_CodeType VARCHAR(50), IN p_ViewCellTemplate TEXT, IN p_DefaultColumnWidth INTEGER, IN p_UserSearchParamFormatAPI VARCHAR(500), IN p_RelatedEntityID UUID, IN p_RelatedEntityFieldName VARCHAR(255), IN p_RelatedEntityNameFieldMap VARCHAR(255), IN p_EntityIDFieldName VARCHAR(100), IN p_ScopeDefault VARCHAR(100), IN p_EncryptionKeyID UUID, IN p_RelatedEntityJoinFields TEXT, IN p_ID UUID DEFAULT NULL, IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL, IN p_IsPrimaryKey BOOLEAN DEFAULT NULL, IN p_IsUnique BOOLEAN DEFAULT NULL, IN p_ValueListType VARCHAR(20) DEFAULT NULL, IN p_DefaultInView BOOLEAN DEFAULT NULL, IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL, IN p_AllowUpdateInView BOOLEAN DEFAULT NULL, IN p_IncludeInUserSearchAPI BOOLEAN DEFAULT NULL, IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL, IN p_IncludeInGeneratedForm BOOLEAN DEFAULT NULL, IN p_GeneratedFormSection VARCHAR(10) DEFAULT NULL, IN p_IsNameField BOOLEAN DEFAULT NULL, IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN DEFAULT NULL, IN p_RelatedEntityDisplayType VARCHAR(20) DEFAULT NULL, IN p_AutoUpdateRelatedEntityInfo BOOLEAN DEFAULT NULL, IN p_ValuesToPackWithSchema VARCHAR(10) DEFAULT NULL, IN p_Status VARCHAR(25) DEFAULT NULL, IN p_AutoUpdateIsNameField BOOLEAN DEFAULT NULL, IN p_AutoUpdateDefaultInView BOOLEAN DEFAULT NULL, IN p_AutoUpdateCategory BOOLEAN DEFAULT NULL, IN p_AutoUpdateDisplayName BOOLEAN DEFAULT NULL, IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN DEFAULT NULL, IN p_Encrypt BOOLEAN DEFAULT NULL, IN p_AllowDecryptInAPI BOOLEAN DEFAULT NULL, IN p_SendEncryptedValue BOOLEAN DEFAULT NULL, IN p_IsSoftPrimaryKey BOOLEAN DEFAULT NULL, IN p_IsSoftForeignKey BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEntityFields" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityField"
            ("ID", "DisplayName", "Description", "AutoUpdateDescription", "IsPrimaryKey", "IsUnique", "Category", "ValueListType", "ExtendedType", "CodeType", "DefaultInView", "ViewCellTemplate", "DefaultColumnWidth", "AllowUpdateAPI", "AllowUpdateInView", "IncludeInUserSearchAPI", "FullTextSearchEnabled", "UserSearchParamFormatAPI", "IncludeInGeneratedForm", "GeneratedFormSection", "IsNameField", "RelatedEntityID", "RelatedEntityFieldName", "IncludeRelatedEntityNameFieldInBaseView", "RelatedEntityNameFieldMap", "RelatedEntityDisplayType", "EntityIDFieldName", "ScopeDefault", "AutoUpdateRelatedEntityInfo", "ValuesToPackWithSchema", "Status", "AutoUpdateIsNameField", "AutoUpdateDefaultInView", "AutoUpdateCategory", "AutoUpdateDisplayName", "AutoUpdateIncludeInUserSearchAPI", "Encrypt", "EncryptionKeyID", "AllowDecryptInAPI", "SendEncryptedValue", "IsSoftPrimaryKey", "IsSoftForeignKey", "RelatedEntityJoinFields")
        VALUES
            (p_ID, p_DisplayName, p_Description, p_AutoUpdateDescription, p_IsPrimaryKey, p_IsUnique, p_Category, p_ValueListType, p_ExtendedType, p_CodeType, p_DefaultInView, p_ViewCellTemplate, p_DefaultColumnWidth, p_AllowUpdateAPI, p_AllowUpdateInView, p_IncludeInUserSearchAPI, p_FullTextSearchEnabled, p_UserSearchParamFormatAPI, p_IncludeInGeneratedForm, p_GeneratedFormSection, p_IsNameField, p_RelatedEntityID, p_RelatedEntityFieldName, p_IncludeRelatedEntityNameFieldInBaseView, p_RelatedEntityNameFieldMap, p_RelatedEntityDisplayType, p_EntityIDFieldName, p_ScopeDefault, p_AutoUpdateRelatedEntityInfo, p_ValuesToPackWithSchema, p_Status, p_AutoUpdateIsNameField, p_AutoUpdateDefaultInView, p_AutoUpdateCategory, p_AutoUpdateDisplayName, p_AutoUpdateIncludeInUserSearchAPI, p_Encrypt, p_EncryptionKeyID, p_AllowDecryptInAPI, p_SendEncryptedValue, p_IsSoftPrimaryKey, p_IsSoftForeignKey, p_RelatedEntityJoinFields)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityField"
            ("DisplayName", "Description", "AutoUpdateDescription", "IsPrimaryKey", "IsUnique", "Category", "ValueListType", "ExtendedType", "CodeType", "DefaultInView", "ViewCellTemplate", "DefaultColumnWidth", "AllowUpdateAPI", "AllowUpdateInView", "IncludeInUserSearchAPI", "FullTextSearchEnabled", "UserSearchParamFormatAPI", "IncludeInGeneratedForm", "GeneratedFormSection", "IsNameField", "RelatedEntityID", "RelatedEntityFieldName", "IncludeRelatedEntityNameFieldInBaseView", "RelatedEntityNameFieldMap", "RelatedEntityDisplayType", "EntityIDFieldName", "ScopeDefault", "AutoUpdateRelatedEntityInfo", "ValuesToPackWithSchema", "Status", "AutoUpdateIsNameField", "AutoUpdateDefaultInView", "AutoUpdateCategory", "AutoUpdateDisplayName", "AutoUpdateIncludeInUserSearchAPI", "Encrypt", "EncryptionKeyID", "AllowDecryptInAPI", "SendEncryptedValue", "IsSoftPrimaryKey", "IsSoftForeignKey", "RelatedEntityJoinFields")
        VALUES
            (p_DisplayName, p_Description, p_AutoUpdateDescription, p_IsPrimaryKey, p_IsUnique, p_Category, p_ValueListType, p_ExtendedType, p_CodeType, p_DefaultInView, p_ViewCellTemplate, p_DefaultColumnWidth, p_AllowUpdateAPI, p_AllowUpdateInView, p_IncludeInUserSearchAPI, p_FullTextSearchEnabled, p_UserSearchParamFormatAPI, p_IncludeInGeneratedForm, p_GeneratedFormSection, p_IsNameField, p_RelatedEntityID, p_RelatedEntityFieldName, p_IncludeRelatedEntityNameFieldInBaseView, p_RelatedEntityNameFieldMap, p_RelatedEntityDisplayType, p_EntityIDFieldName, p_ScopeDefault, p_AutoUpdateRelatedEntityInfo, p_ValuesToPackWithSchema, p_Status, p_AutoUpdateIsNameField, p_AutoUpdateDefaultInView, p_AutoUpdateCategory, p_AutoUpdateDisplayName, p_AutoUpdateIncludeInUserSearchAPI, p_Encrypt, p_EncryptionKeyID, p_AllowDecryptInAPI, p_SendEncryptedValue, p_IsSoftPrimaryKey, p_IsSoftForeignKey, p_RelatedEntityJoinFields)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateListCategory"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwListCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModality"(IN p_Name VARCHAR(50), IN p_Description VARCHAR(500), IN p_ContentBlockType VARCHAR(50), IN p_MIMETypePattern VARCHAR(100), IN p_DefaultMaxSizeBytes INTEGER, IN p_DefaultMaxCountPerMessage INTEGER, IN p_ID UUID DEFAULT NULL, IN p_Type VARCHAR(50) DEFAULT NULL, IN p_DisplayOrder INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAIModalities" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIModality"
            ("ID", "Name", "Description", "ContentBlockType", "MIMETypePattern", "Type", "DefaultMaxSizeBytes", "DefaultMaxCountPerMessage", "DisplayOrder")
        VALUES
            (p_ID, p_Name, p_Description, p_ContentBlockType, p_MIMETypePattern, p_Type, p_DefaultMaxSizeBytes, p_DefaultMaxCountPerMessage, p_DisplayOrder)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIModality"
            ("Name", "Description", "ContentBlockType", "MIMETypePattern", "Type", "DefaultMaxSizeBytes", "DefaultMaxCountPerMessage", "DisplayOrder")
        VALUES
            (p_Name, p_Description, p_ContentBlockType, p_MIMETypePattern, p_Type, p_DefaultMaxSizeBytes, p_DefaultMaxCountPerMessage, p_DisplayOrder)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIModalities" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecommendationProvider"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRecommendationProviders" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecommendationProvider"
            ("ID", "Name", "Description")
        VALUES
            (p_ID, p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecommendationProvider"
            ("Name", "Description")
        VALUES
            (p_Name, p_Description)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecommendationProviders" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptType"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwAIPromptTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIPromptType"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIPromptTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRowLevelSecurityFilter"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_FilterText TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRowLevelSecurityFilters" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RowLevelSecurityFilter"
            ("ID", "Name", "Description", "FilterText")
        VALUES
            (p_ID, p_Name, p_Description, p_FilterText)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RowLevelSecurityFilter"
            ("Name", "Description", "FilterText")
        VALUES
            (p_Name, p_Description, p_FilterText)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRowLevelSecurityFilters" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVersionInstallation"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."VersionInstallation"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityField"(IN p_ID UUID, IN p_DisplayName VARCHAR(255), IN p_Description TEXT, IN p_AutoUpdateDescription BOOLEAN, IN p_IsPrimaryKey BOOLEAN, IN p_IsUnique BOOLEAN, IN p_Category VARCHAR(255), IN p_ValueListType VARCHAR(20), IN p_ExtendedType VARCHAR(50), IN p_CodeType VARCHAR(50), IN p_DefaultInView BOOLEAN, IN p_ViewCellTemplate TEXT, IN p_DefaultColumnWidth INTEGER, IN p_AllowUpdateAPI BOOLEAN, IN p_AllowUpdateInView BOOLEAN, IN p_IncludeInUserSearchAPI BOOLEAN, IN p_FullTextSearchEnabled BOOLEAN, IN p_UserSearchParamFormatAPI VARCHAR(500), IN p_IncludeInGeneratedForm BOOLEAN, IN p_GeneratedFormSection VARCHAR(10), IN p_IsNameField BOOLEAN, IN p_RelatedEntityID UUID, IN p_RelatedEntityFieldName VARCHAR(255), IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN, IN p_RelatedEntityNameFieldMap VARCHAR(255), IN p_RelatedEntityDisplayType VARCHAR(20), IN p_EntityIDFieldName VARCHAR(100), IN p_ScopeDefault VARCHAR(100), IN p_AutoUpdateRelatedEntityInfo BOOLEAN, IN p_ValuesToPackWithSchema VARCHAR(10), IN p_Status VARCHAR(25), IN p_AutoUpdateIsNameField BOOLEAN, IN p_AutoUpdateDefaultInView BOOLEAN, IN p_AutoUpdateCategory BOOLEAN, IN p_AutoUpdateDisplayName BOOLEAN, IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN, IN p_Encrypt BOOLEAN, IN p_EncryptionKeyID UUID, IN p_AllowDecryptInAPI BOOLEAN, IN p_SendEncryptedValue BOOLEAN, IN p_IsSoftPrimaryKey BOOLEAN, IN p_IsSoftForeignKey BOOLEAN, IN p_RelatedEntityJoinFields TEXT)
RETURNS SETOF __mj."vwEntityFields" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDashboardCategory"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID)
RETURNS SETOF __mj."vwDashboardCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateMCPServerConnection"(IN p_MCPServerID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CredentialID UUID, IN p_CustomHeaderName VARCHAR(100), IN p_CompanyID UUID, IN p_MaxOutputLogSize INTEGER, IN p_LastConnectedAt TIMESTAMPTZ, IN p_LastErrorMessage TEXT, IN p_EnvironmentVars TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_AutoSyncTools BOOLEAN DEFAULT NULL, IN p_AutoGenerateActions BOOLEAN DEFAULT NULL, IN p_LogToolCalls BOOLEAN DEFAULT NULL, IN p_LogInputParameters BOOLEAN DEFAULT NULL, IN p_LogOutputContent BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwMCPServerConnections" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."MCPServerConnection"
            ("ID", "MCPServerID", "Name", "Description", "CredentialID", "CustomHeaderName", "CompanyID", "Status", "AutoSyncTools", "AutoGenerateActions", "LogToolCalls", "LogInputParameters", "LogOutputContent", "MaxOutputLogSize", "LastConnectedAt", "LastErrorMessage", "EnvironmentVars")
        VALUES
            (p_ID, p_MCPServerID, p_Name, p_Description, p_CredentialID, p_CustomHeaderName, p_CompanyID, p_Status, p_AutoSyncTools, p_AutoGenerateActions, p_LogToolCalls, p_LogInputParameters, p_LogOutputContent, p_MaxOutputLogSize, p_LastConnectedAt, p_LastErrorMessage, p_EnvironmentVars)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."MCPServerConnection"
            ("MCPServerID", "Name", "Description", "CredentialID", "CustomHeaderName", "CompanyID", "Status", "AutoSyncTools", "AutoGenerateActions", "LogToolCalls", "LogInputParameters", "LogOutputContent", "MaxOutputLogSize", "LastConnectedAt", "LastErrorMessage", "EnvironmentVars")
        VALUES
            (p_MCPServerID, p_Name, p_Description, p_CredentialID, p_CustomHeaderName, p_CompanyID, p_Status, p_AutoSyncTools, p_AutoGenerateActions, p_LogToolCalls, p_LogInputParameters, p_LogOutputContent, p_MaxOutputLogSize, p_LastConnectedAt, p_LastErrorMessage, p_EnvironmentVars)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerConnections" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateGeneratedCodeCategory"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ParentID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwGeneratedCodeCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelVendor"(IN p_ID UUID, IN p_ModelID UUID, IN p_VendorID UUID, IN p_Priority INTEGER, IN p_Status VARCHAR(20), IN p_DriverClass VARCHAR(100), IN p_DriverImportPath VARCHAR(255), IN p_APIName VARCHAR(100), IN p_MaxInputTokens INTEGER, IN p_MaxOutputTokens INTEGER, IN p_SupportedResponseFormats VARCHAR(100), IN p_SupportsEffortLevel BOOLEAN, IN p_SupportsStreaming BOOLEAN, IN p_TypeID UUID)
RETURNS SETOF __mj."vwAIModelVendors" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelVendor"
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
        "TypeID" = p_TypeID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKey"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."APIKey"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifact"(IN p_ID UUID, IN p_EnvironmentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_TypeID UUID, IN p_Comments TEXT, IN p_UserID UUID, IN p_Visibility VARCHAR(20))
RETURNS SETOF __mj."vwArtifacts" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Artifact"
    SET
        "EnvironmentID" = p_EnvironmentID,
        "Name" = p_Name,
        "Description" = p_Description,
        "TypeID" = p_TypeID,
        "Comments" = p_Comments,
        "UserID" = p_UserID,
        "Visibility" = p_Visibility
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwArtifacts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDataset"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT)
RETURNS SETOF __mj."vwDatasets" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Dataset"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwDatasets" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestSuite"(IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Tags TEXT, IN p_Configuration TEXT, IN p_MaxExecutionTimeMS INTEGER, IN p_Variables TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwTestSuites" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestSuite"
            ("ID", "ParentID", "Name", "Description", "Status", "Tags", "Configuration", "MaxExecutionTimeMS", "Variables")
        VALUES
            (p_ID, p_ParentID, p_Name, p_Description, p_Status, p_Tags, p_Configuration, p_MaxExecutionTimeMS, p_Variables)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestSuite"
            ("ParentID", "Name", "Description", "Status", "Tags", "Configuration", "MaxExecutionTimeMS", "Variables")
        VALUES
            (p_ParentID, p_Name, p_Description, p_Status, p_Tags, p_Configuration, p_MaxExecutionTimeMS, p_Variables)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestSuites" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserFavorite"(IN p_UserID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwUserFavorites" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateMCPServerConnection"(IN p_ID UUID, IN p_MCPServerID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_CredentialID UUID, IN p_CustomHeaderName VARCHAR(100), IN p_CompanyID UUID, IN p_Status VARCHAR(50), IN p_AutoSyncTools BOOLEAN, IN p_AutoGenerateActions BOOLEAN, IN p_LogToolCalls BOOLEAN, IN p_LogInputParameters BOOLEAN, IN p_LogOutputContent BOOLEAN, IN p_MaxOutputLogSize INTEGER, IN p_LastConnectedAt TIMESTAMPTZ, IN p_LastErrorMessage TEXT, IN p_EnvironmentVars TEXT)
RETURNS SETOF __mj."vwMCPServerConnections" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."MCPServerConnection"
    SET
        "MCPServerID" = p_MCPServerID,
        "Name" = p_Name,
        "Description" = p_Description,
        "CredentialID" = p_CredentialID,
        "CustomHeaderName" = p_CustomHeaderName,
        "CompanyID" = p_CompanyID,
        "Status" = p_Status,
        "AutoSyncTools" = p_AutoSyncTools,
        "AutoGenerateActions" = p_AutoGenerateActions,
        "LogToolCalls" = p_LogToolCalls,
        "LogInputParameters" = p_LogInputParameters,
        "LogOutputContent" = p_LogOutputContent,
        "MaxOutputLogSize" = p_MaxOutputLogSize,
        "LastConnectedAt" = p_LastConnectedAt,
        "LastErrorMessage" = p_LastErrorMessage,
        "EnvironmentVars" = p_EnvironmentVars
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwMCPServerConnections" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ContentType VARCHAR(100), IN p_ParentID UUID, IN p_ExtractRules TEXT, IN p_DriverClass VARCHAR(255), IN p_Icon VARCHAR(255), IN p_ID UUID DEFAULT NULL, IN p_IsEnabled BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwArtifactTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ArtifactType"
            ("ID", "Name", "Description", "ContentType", "IsEnabled", "ParentID", "ExtractRules", "DriverClass", "Icon")
        VALUES
            (p_ID, p_Name, p_Description, p_ContentType, p_IsEnabled, p_ParentID, p_ExtractRules, p_DriverClass, p_Icon)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ArtifactType"
            ("Name", "Description", "ContentType", "IsEnabled", "ParentID", "ExtractRules", "DriverClass", "Icon")
        VALUES
            (p_Name, p_Description, p_ContentType, p_IsEnabled, p_ParentID, p_ExtractRules, p_DriverClass, p_Icon)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplication"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_Icon VARCHAR(500), IN p_DefaultForNewUser BOOLEAN, IN p_SchemaAutoAddNewEntities TEXT, IN p_Color VARCHAR(20), IN p_DefaultNavItems TEXT, IN p_ClassName VARCHAR(255), IN p_DefaultSequence INTEGER, IN p_Status VARCHAR(20), IN p_NavigationStyle VARCHAR(20), IN p_TopNavLocation VARCHAR(30), IN p_HideNavBarIconWhenActive BOOLEAN, IN p_Path VARCHAR(100), IN p_AutoUpdatePath BOOLEAN)
RETURNS SETOF __mj."vwApplications" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Application"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "Icon" = p_Icon,
        "DefaultForNewUser" = p_DefaultForNewUser,
        "SchemaAutoAddNewEntities" = p_SchemaAutoAddNewEntities,
        "Color" = p_Color,
        "DefaultNavItems" = p_DefaultNavItems,
        "ClassName" = p_ClassName,
        "DefaultSequence" = p_DefaultSequence,
        "Status" = p_Status,
        "NavigationStyle" = p_NavigationStyle,
        "TopNavLocation" = p_TopNavLocation,
        "HideNavBarIconWhenActive" = p_HideNavBarIconWhenActive,
        "Path" = p_Path,
        "AutoUpdatePath" = p_AutoUpdatePath
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwApplications" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentArtifactType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentArtifactType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestSuite"(IN p_ID UUID, IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Status VARCHAR(20), IN p_Tags TEXT, IN p_Configuration TEXT, IN p_MaxExecutionTimeMS INTEGER, IN p_Variables TEXT)
RETURNS SETOF __mj."vwTestSuites" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityField"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."EntityField"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteGeneratedCode"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."GeneratedCode"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEmployeeCompanyIntegration"(IN p_ID UUID, IN p_EmployeeID UUID, IN p_CompanyIntegrationID UUID, IN p_ExternalSystemRecordID VARCHAR(750), IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwEmployeeCompanyIntegrations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EmployeeCompanyIntegration"
    SET
        "EmployeeID" = p_EmployeeID,
        "CompanyIntegrationID" = p_CompanyIntegrationID,
        "ExternalSystemRecordID" = p_ExternalSystemRecordID,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEmployeeCompanyIntegrations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateComponentLibrary"(IN p_Name VARCHAR(500), IN p_DisplayName VARCHAR(500), IN p_Version VARCHAR(100), IN p_GlobalVariable VARCHAR(255), IN p_Category VARCHAR(100), IN p_CDNUrl VARCHAR(1000), IN p_CDNCssUrl VARCHAR(1000), IN p_Description TEXT, IN p_LintRules TEXT, IN p_Dependencies TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL, IN p_UsageType VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwComponentLibraries" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ComponentLibrary"
            ("ID", "Name", "DisplayName", "Version", "GlobalVariable", "Category", "CDNUrl", "CDNCssUrl", "Description", "Status", "LintRules", "Dependencies", "UsageType")
        VALUES
            (p_ID, p_Name, p_DisplayName, p_Version, p_GlobalVariable, p_Category, p_CDNUrl, p_CDNCssUrl, p_Description, p_Status, p_LintRules, p_Dependencies, p_UsageType)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ComponentLibrary"
            ("Name", "DisplayName", "Version", "GlobalVariable", "Category", "CDNUrl", "CDNCssUrl", "Description", "Status", "LintRules", "Dependencies", "UsageType")
        VALUES
            (p_Name, p_DisplayName, p_Version, p_GlobalVariable, p_Category, p_CDNUrl, p_CDNCssUrl, p_Description, p_Status, p_LintRules, p_Dependencies, p_UsageType)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwComponentLibraries" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordLink"(IN p_SourceEntityID UUID, IN p_SourceRecordID VARCHAR(500), IN p_TargetEntityID UUID, IN p_TargetRecordID VARCHAR(500), IN p_LinkType VARCHAR(50), IN p_Sequence INTEGER, IN p_Metadata TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwRecordLinks" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."RecordLink"
            ("ID", "SourceEntityID", "SourceRecordID", "TargetEntityID", "TargetRecordID", "LinkType", "Sequence", "Metadata")
        VALUES
            (p_ID, p_SourceEntityID, p_SourceRecordID, p_TargetEntityID, p_TargetRecordID, p_LinkType, p_Sequence, p_Metadata)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."RecordLink"
            ("SourceEntityID", "SourceRecordID", "TargetEntityID", "TargetRecordID", "LinkType", "Sequence", "Metadata")
        VALUES
            (p_SourceEntityID, p_SourceRecordID, p_TargetEntityID, p_TargetRecordID, p_LinkType, p_Sequence, p_Metadata)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwRecordLinks" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteMCPServerConnection"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."MCPServerConnection"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordChangeReplayRun"(IN p_ID UUID, IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Status VARCHAR(50), IN p_UserID UUID)
RETURNS SETOF __mj."vwRecordChangeReplayRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecordChangeReplayRun"
    SET
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Status" = p_Status,
        "UserID" = p_UserID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecordChangeReplayRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentPermission"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIAgentPermission"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAPIApplication"(IN p_Name VARCHAR(100), IN p_Description VARCHAR(500), IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAPIApplications" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIApplication"
            ("ID", "Name", "Description", "IsActive")
        VALUES
            (p_ID, p_Name, p_Description, p_IsActive)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIApplication"
            ("Name", "Description", "IsActive")
        VALUES
            (p_Name, p_Description, p_IsActive)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIApplications" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateSkill"(IN p_Name VARCHAR(50), IN p_ParentID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwSkills" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityRelationshipDisplayComponent"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_RelationshipType VARCHAR(20))
RETURNS SETOF __mj."vwEntityRelationshipDisplayComponents" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."EntityRelationshipDisplayComponent"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "RelationshipType" = p_RelationshipType
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwEntityRelationshipDisplayComponents" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteDuplicateRunDetailMatch"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."DuplicateRunDetailMatch"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestSuite"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TestSuite"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAPIKeyScope"(IN p_APIKeyID UUID, IN p_ScopeID UUID, IN p_ResourcePattern VARCHAR(750), IN p_ID UUID DEFAULT NULL, IN p_PatternType VARCHAR(20) DEFAULT NULL, IN p_IsDeny BOOLEAN DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAPIKeyScopes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIKeyScope"
            ("ID", "APIKeyID", "ScopeID", "ResourcePattern", "PatternType", "IsDeny", "Priority")
        VALUES
            (p_ID, p_APIKeyID, p_ScopeID, p_ResourcePattern, p_PatternType, p_IsDeny, p_Priority)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIKeyScope"
            ("APIKeyID", "ScopeID", "ResourcePattern", "PatternType", "IsDeny", "Priority")
        VALUES
            (p_APIKeyID, p_ScopeID, p_ResourcePattern, p_PatternType, p_IsDeny, p_Priority)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeyScopes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledAction"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ScheduledAction"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentTypeAttribute"(IN p_ID UUID, IN p_ContentTypeID UUID, IN p_Name VARCHAR(100), IN p_Prompt TEXT, IN p_Description TEXT)
RETURNS SETOF __mj."vwContentTypeAttributes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ContentTypeAttribute"
    SET
        "ContentTypeID" = p_ContentTypeID,
        "Name" = p_Name,
        "Prompt" = p_Prompt,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwContentTypeAttributes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIVendor"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIVendor"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIApplication"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description VARCHAR(500), IN p_IsActive BOOLEAN)
RETURNS SETOF __mj."vwAPIApplications" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."APIApplication"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "IsActive" = p_IsActive
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAPIApplications" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateListShare"(IN p_ID UUID, IN p_ListID UUID, IN p_UserID UUID, IN p_Role VARCHAR(50), IN p_Status VARCHAR(20))
RETURNS SETOF __mj."vwListShares" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ListShare"
    SET
        "ListID" = p_ListID,
        "UserID" = p_UserID,
        "Role" = p_Role,
        "Status" = p_Status
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwListShares" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTask"(IN p_ParentID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_TypeID UUID, IN p_ProjectID UUID, IN p_ConversationDetailID UUID, IN p_UserID UUID, IN p_AgentID UUID, IN p_PercentComplete INTEGER, IN p_DueAt TIMESTAMPTZ, IN p_StartedAt TIMESTAMPTZ, IN p_CompletedAt TIMESTAMPTZ, IN p_ID UUID DEFAULT NULL, IN p_EnvironmentID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Task"
            ("ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt")
        VALUES
            (p_ID, p_ParentID, p_Name, p_Description, p_TypeID, p_EnvironmentID, p_ProjectID, p_ConversationDetailID, p_UserID, p_AgentID, p_Status, p_PercentComplete, p_DueAt, p_StartedAt, p_CompletedAt)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Task" DEFAULT VALUES
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT v_id AS "ID";
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIKeyScope"(IN p_ID UUID, IN p_APIKeyID UUID, IN p_ScopeID UUID, IN p_ResourcePattern VARCHAR(750), IN p_PatternType VARCHAR(20), IN p_IsDeny BOOLEAN, IN p_Priority INTEGER)
RETURNS SETOF __mj."vwAPIKeyScopes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."APIKeyScope"
    SET
        "APIKeyID" = p_APIKeyID,
        "ScopeID" = p_ScopeID,
        "ResourcePattern" = p_ResourcePattern,
        "PatternType" = p_PatternType,
        "IsDeny" = p_IsDeny,
        "Priority" = p_Priority
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeyScopes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelModality"(IN p_ID UUID, IN p_ModelID UUID, IN p_ModalityID UUID, IN p_Direction VARCHAR(10), IN p_IsSupported BOOLEAN, IN p_IsRequired BOOLEAN, IN p_SupportedFormats VARCHAR(500), IN p_MaxSizeBytes INTEGER, IN p_MaxCountPerMessage INTEGER, IN p_MaxDimension INTEGER, IN p_Comments TEXT)
RETURNS SETOF __mj."vwAIModelModalities" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModelModality"
    SET
        "ModelID" = p_ModelID,
        "ModalityID" = p_ModalityID,
        "Direction" = p_Direction,
        "IsSupported" = p_IsSupported,
        "IsRequired" = p_IsRequired,
        "SupportedFormats" = p_SupportedFormats,
        "MaxSizeBytes" = p_MaxSizeBytes,
        "MaxCountPerMessage" = p_MaxCountPerMessage,
        "MaxDimension" = p_MaxDimension,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModelModalities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationRun"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CompanyIntegrationRun"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAuthorizationRole"(IN p_AuthorizationID UUID, IN p_RoleID UUID, IN p_ID UUID DEFAULT NULL, IN p_Type CHAR(10) DEFAULT NULL)
RETURNS SETOF __mj."vwAuthorizationRoles" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AuthorizationRole"
            ("ID", "AuthorizationID", "RoleID", "Type")
        VALUES
            (p_ID, p_AuthorizationID, p_RoleID, p_Type)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AuthorizationRole"
            ("AuthorizationID", "RoleID", "Type")
        VALUES
            (p_AuthorizationID, p_RoleID, p_Type)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAuthorizationRoles" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateVectorDatabase"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DefaultURL VARCHAR(255), IN p_ClassKey VARCHAR(100), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwVectorDatabases" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."VectorDatabase"
            ("ID", "Name", "Description", "DefaultURL", "ClassKey")
        VALUES
            (p_ID, p_Name, p_Description, p_DefaultURL, p_ClassKey)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."VectorDatabase"
            ("Name", "Description", "DefaultURL", "ClassKey")
        VALUES
            (p_Name, p_Description, p_DefaultURL, p_ClassKey)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentPermission"(IN p_ID UUID, IN p_AgentID UUID, IN p_RoleID UUID, IN p_UserID UUID, IN p_CanView BOOLEAN, IN p_CanRun BOOLEAN, IN p_CanEdit BOOLEAN, IN p_CanDelete BOOLEAN, IN p_Comments TEXT)
RETURNS SETOF __mj."vwAIAgentPermissions" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentPermission"
    SET
        "AgentID" = p_AgentID,
        "RoleID" = p_RoleID,
        "UserID" = p_UserID,
        "CanView" = p_CanView,
        "CanRun" = p_CanRun,
        "CanEdit" = p_CanEdit,
        "CanDelete" = p_CanDelete,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentPermissions" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestType"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255), IN p_VariablesSchema TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwTestTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TestType"
            ("ID", "Name", "Description", "DriverClass", "Status", "VariablesSchema")
        VALUES
            (p_ID, p_Name, p_Description, p_DriverClass, p_Status, p_VariablesSchema)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TestType"
            ("Name", "Description", "DriverClass", "Status", "VariablesSchema")
        VALUES
            (p_Name, p_Description, p_DriverClass, p_Status, p_VariablesSchema)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTestTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateListCategory"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ParentID UUID, IN p_UserID UUID)
RETURNS SETOF __mj."vwListCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAPIScope"(IN p_Name VARCHAR(100), IN p_Category VARCHAR(100), IN p_Description VARCHAR(500), IN p_ParentID UUID, IN p_FullPath VARCHAR(500), IN p_ResourceType VARCHAR(50), IN p_UIConfig TEXT, IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAPIScopes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIScope"
            ("ID", "Name", "Category", "Description", "ParentID", "FullPath", "ResourceType", "IsActive", "UIConfig")
        VALUES
            (p_ID, p_Name, p_Category, p_Description, p_ParentID, p_FullPath, p_ResourceType, p_IsActive, p_UIConfig)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIScope"
            ("Name", "Category", "Description", "ParentID", "FullPath", "ResourceType", "IsActive", "UIConfig")
        VALUES
            (p_Name, p_Category, p_Description, p_ParentID, p_FullPath, p_ResourceType, p_IsActive, p_UIConfig)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIScopes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecommendationProvider"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT)
RETURNS SETOF __mj."vwRecommendationProviders" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecommendationProvider"
    SET
        "Name" = p_Name,
        "Description" = p_Description
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecommendationProviders" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIApplication"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."APIApplication"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationArtifactVersion"(IN p_ConversationArtifactID UUID, IN p_Version INTEGER, IN p_Configuration TEXT, IN p_Content TEXT, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwConversationArtifactVersions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ConversationArtifactVersion"
            ("ID", "ConversationArtifactID", "Version", "Configuration", "Content", "Comments")
        VALUES
            (p_ID, p_ConversationArtifactID, p_Version, p_Configuration, p_Content, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ConversationArtifactVersion"
            ("ConversationArtifactID", "Version", "Configuration", "Content", "Comments")
        VALUES
            (p_ConversationArtifactID, p_Version, p_Configuration, p_Content, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwConversationArtifactVersions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueryEntity"(IN p_QueryID UUID, IN p_EntityID UUID, IN p_AutoDetectConfidenceScore NUMERIC(3,2), IN p_ID UUID DEFAULT NULL, IN p_DetectionMethod VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwQueryEntities" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."QueryEntity"
            ("ID", "QueryID", "EntityID", "DetectionMethod", "AutoDetectConfidenceScore")
        VALUES
            (p_ID, p_QueryID, p_EntityID, p_DetectionMethod, p_AutoDetectConfidenceScore)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."QueryEntity"
            ("QueryID", "EntityID", "DetectionMethod", "AutoDetectConfidenceScore")
        VALUES
            (p_QueryID, p_EntityID, p_DetectionMethod, p_AutoDetectConfidenceScore)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueryEntities" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRequest"(IN p_AgentID UUID, IN p_RequestedAt TIMESTAMPTZ, IN p_RequestForUserID UUID, IN p_Status VARCHAR(20), IN p_Request TEXT, IN p_Response TEXT, IN p_ResponseByUserID UUID, IN p_RespondedAt TIMESTAMPTZ, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentRequests" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRequest"
            ("ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments")
        VALUES
            (p_ID, p_AgentID, p_RequestedAt, p_RequestForUserID, p_Status, p_Request, p_Response, p_ResponseByUserID, p_RespondedAt, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentRequest"
            ("AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments")
        VALUES
            (p_AgentID, p_RequestedAt, p_RequestForUserID, p_Status, p_Request, p_Response, p_ResponseByUserID, p_RespondedAt, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DriverClass VARCHAR(255), IN p_Status VARCHAR(20), IN p_VariablesSchema TEXT)
RETURNS SETOF __mj."vwTestTypes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."TestType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "Status" = p_Status,
        "VariablesSchema" = p_VariablesSchema
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTestTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKeyScope"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."APIKeyScope"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItem"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ContentItem"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIScope"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Category VARCHAR(100), IN p_Description VARCHAR(500), IN p_ParentID UUID, IN p_FullPath VARCHAR(500), IN p_ResourceType VARCHAR(50), IN p_IsActive BOOLEAN, IN p_UIConfig TEXT)
RETURNS SETOF __mj."vwAPIScopes" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTemplateContentType"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ID UUID DEFAULT NULL, IN p_CodeType VARCHAR(25) DEFAULT NULL)
RETURNS SETOF __mj."vwTemplateContentTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."TemplateContentType"
            ("ID", "Name", "Description", "CodeType")
        VALUES
            (p_ID, p_Name, p_Description, p_CodeType)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."TemplateContentType"
            ("Name", "Description", "CodeType")
        VALUES
            (p_Name, p_Description, p_CodeType)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTemplateContentTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteOutputFormatType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."OutputFormatType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIConfiguration"(IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DefaultPromptForContextCompressionID UUID, IN p_DefaultPromptForContextSummarizationID UUID, IN p_DefaultStorageProviderID UUID, IN p_DefaultStorageRootPath VARCHAR(500), IN p_ParentID UUID, IN p_ID UUID DEFAULT NULL, IN p_IsDefault BOOLEAN DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAIConfigurations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIConfiguration"
            ("ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID")
        VALUES
            (p_ID, p_Name, p_Description, p_IsDefault, p_Status, p_DefaultPromptForContextCompressionID, p_DefaultPromptForContextSummarizationID, p_DefaultStorageProviderID, p_DefaultStorageRootPath, p_ParentID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIConfiguration"
            ("Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID")
        VALUES
            (p_Name, p_Description, p_IsDefault, p_Status, p_DefaultPromptForContextCompressionID, p_DefaultPromptForContextSummarizationID, p_DefaultStorageProviderID, p_DefaultStorageRootPath, p_ParentID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIConfigurations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRowLevelSecurityFilter"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_FilterText TEXT)
RETURNS SETOF __mj."vwRowLevelSecurityFilters" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RowLevelSecurityFilter"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "FilterText" = p_FilterText
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRowLevelSecurityFilters" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegration"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Integration"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAPIKeyApplication"(IN p_APIKeyID UUID, IN p_ApplicationID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwAPIKeyApplications" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIKeyApplication"
            ("ID", "APIKeyID", "ApplicationID")
        VALUES
            (p_ID, p_APIKeyID, p_ApplicationID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIKeyApplication"
            ("APIKeyID", "ApplicationID")
        VALUES
            (p_APIKeyID, p_ApplicationID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeyApplications" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentModality"(IN p_AgentID UUID, IN p_ModalityID UUID, IN p_Direction VARCHAR(10), IN p_MaxSizeBytes INTEGER, IN p_MaxCountPerMessage INTEGER, IN p_ID UUID DEFAULT NULL, IN p_IsAllowed BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentModalities" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentModality"
            ("ID", "AgentID", "ModalityID", "Direction", "IsAllowed", "MaxSizeBytes", "MaxCountPerMessage")
        VALUES
            (p_ID, p_AgentID, p_ModalityID, p_Direction, p_IsAllowed, p_MaxSizeBytes, p_MaxCountPerMessage)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentModality"
            ("AgentID", "ModalityID", "Direction", "IsAllowed", "MaxSizeBytes", "MaxCountPerMessage")
        VALUES
            (p_AgentID, p_ModalityID, p_Direction, p_IsAllowed, p_MaxSizeBytes, p_MaxCountPerMessage)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentModalities" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateComponentLibrary"(IN p_ID UUID, IN p_Name VARCHAR(500), IN p_DisplayName VARCHAR(500), IN p_Version VARCHAR(100), IN p_GlobalVariable VARCHAR(255), IN p_Category VARCHAR(100), IN p_CDNUrl VARCHAR(1000), IN p_CDNCssUrl VARCHAR(1000), IN p_Description TEXT, IN p_Status VARCHAR(20), IN p_LintRules TEXT, IN p_Dependencies TEXT, IN p_UsageType VARCHAR(50))
RETURNS SETOF __mj."vwComponentLibraries" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."ComponentLibrary"
    SET
        "Name" = p_Name,
        "DisplayName" = p_DisplayName,
        "Version" = p_Version,
        "GlobalVariable" = p_GlobalVariable,
        "Category" = p_Category,
        "CDNUrl" = p_CDNUrl,
        "CDNCssUrl" = p_CDNCssUrl,
        "Description" = p_Description,
        "Status" = p_Status,
        "LintRules" = p_LintRules,
        "Dependencies" = p_Dependencies,
        "UsageType" = p_UsageType
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwComponentLibraries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateWorkflowRun"(IN p_WorkflowID UUID, IN p_ExternalSystemRecordID VARCHAR(500), IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Results TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status CHAR(10) DEFAULT NULL)
RETURNS SETOF __mj."vwWorkflowRuns" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."WorkflowRun"
            ("ID", "WorkflowID", "ExternalSystemRecordID", "StartedAt", "EndedAt", "Status", "Results")
        VALUES
            (p_ID, p_WorkflowID, p_ExternalSystemRecordID, p_StartedAt, p_EndedAt, p_Status, p_Results)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."WorkflowRun"
            ("WorkflowID", "ExternalSystemRecordID", "StartedAt", "EndedAt", "Status", "Results")
        VALUES
            (p_WorkflowID, p_ExternalSystemRecordID, p_StartedAt, p_EndedAt, p_Status, p_Results)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwWorkflowRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTestType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."TestType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAPIKeyUsageLog"(IN p_APIKeyID UUID, IN p_Endpoint VARCHAR(500), IN p_Operation VARCHAR(255), IN p_Method VARCHAR(10), IN p_StatusCode INTEGER, IN p_ResponseTimeMs INTEGER, IN p_IPAddress VARCHAR(45), IN p_UserAgent VARCHAR(500), IN p_ApplicationID UUID, IN p_RequestedResource VARCHAR(500), IN p_ScopesEvaluated TEXT, IN p_DeniedReason VARCHAR(500), IN p_ID UUID DEFAULT NULL, IN p_AuthorizationResult VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwAPIKeyUsageLogs" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIKeyUsageLog"
            ("ID", "APIKeyID", "Endpoint", "Operation", "Method", "StatusCode", "ResponseTimeMs", "IPAddress", "UserAgent", "ApplicationID", "RequestedResource", "ScopesEvaluated", "AuthorizationResult", "DeniedReason")
        VALUES
            (p_ID, p_APIKeyID, p_Endpoint, p_Operation, p_Method, p_StatusCode, p_ResponseTimeMs, p_IPAddress, p_UserAgent, p_ApplicationID, p_RequestedResource, p_ScopesEvaluated, p_AuthorizationResult, p_DeniedReason)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIKeyUsageLog"
            ("APIKeyID", "Endpoint", "Operation", "Method", "StatusCode", "ResponseTimeMs", "IPAddress", "UserAgent", "ApplicationID", "RequestedResource", "ScopesEvaluated", "AuthorizationResult", "DeniedReason")
        VALUES
            (p_APIKeyID, p_Endpoint, p_Operation, p_Method, p_StatusCode, p_ResponseTimeMs, p_IPAddress, p_UserAgent, p_ApplicationID, p_RequestedResource, p_ScopesEvaluated, p_AuthorizationResult, p_DeniedReason)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeyUsageLogs" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserRecordLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserRecordLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIScope"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."APIScope"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDashboardUserState"(IN p_DashboardID UUID, IN p_UserID UUID, IN p_UserState TEXT, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwDashboardUserStates" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."DashboardUserState"
            ("ID", "DashboardID", "UserID", "UserState")
        VALUES
            (p_ID, p_DashboardID, p_UserID, p_UserState)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."DashboardUserState"
            ("DashboardID", "UserID", "UserState")
        VALUES
            (p_DashboardID, p_UserID, p_UserState)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwDashboardUserStates" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIKeyApplication"(IN p_ID UUID, IN p_APIKeyID UUID, IN p_ApplicationID UUID)
RETURNS SETOF __mj."vwAPIKeyApplications" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."APIKeyApplication"
    SET
        "APIKeyID" = p_APIKeyID,
        "ApplicationID" = p_ApplicationID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeyApplications" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateFileEntityRecordLink"(IN p_ID UUID, IN p_FileID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(750))
RETURNS SETOF __mj."vwFileEntityRecordLinks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."FileEntityRecordLink"
    SET
        "FileID" = p_FileID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwFileEntityRecordLinks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPrompt"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_TemplateID UUID, IN p_CategoryID UUID, IN p_TypeID UUID, IN p_Status VARCHAR(50), IN p_ModelSpecificResponseFormat TEXT, IN p_AIModelTypeID UUID, IN p_MinPowerRank INTEGER, IN p_ParallelCount INTEGER, IN p_ParallelConfigParam VARCHAR(100), IN p_OutputExample TEXT, IN p_ResultSelectorPromptID UUID, IN p_CacheTTLSeconds INTEGER, IN p_CacheSimilarityThreshold DOUBLE PRECISION, IN p_Temperature NUMERIC(3,2), IN p_TopP NUMERIC(3,2), IN p_TopK INTEGER, IN p_MinP NUMERIC(3,2), IN p_FrequencyPenalty NUMERIC(3,2), IN p_PresencePenalty NUMERIC(3,2), IN p_Seed INTEGER, IN p_StopSequences VARCHAR(1000), IN p_IncludeLogProbs BOOLEAN, IN p_TopLogProbs INTEGER, IN p_FailoverMaxAttempts INTEGER, IN p_FailoverDelaySeconds INTEGER, IN p_EffortLevel INTEGER, IN p_ID UUID DEFAULT NULL, IN p_ResponseFormat VARCHAR(20) DEFAULT NULL, IN p_SelectionStrategy VARCHAR(20) DEFAULT NULL, IN p_PowerPreference VARCHAR(20) DEFAULT NULL, IN p_ParallelizationMode VARCHAR(20) DEFAULT NULL, IN p_OutputType VARCHAR(50) DEFAULT NULL, IN p_ValidationBehavior VARCHAR(50) DEFAULT NULL, IN p_MaxRetries INTEGER DEFAULT NULL, IN p_RetryDelayMS INTEGER DEFAULT NULL, IN p_RetryStrategy VARCHAR(20) DEFAULT NULL, IN p_EnableCaching BOOLEAN DEFAULT NULL, IN p_CacheMatchType VARCHAR(20) DEFAULT NULL, IN p_CacheMustMatchModel BOOLEAN DEFAULT NULL, IN p_CacheMustMatchVendor BOOLEAN DEFAULT NULL, IN p_CacheMustMatchAgent BOOLEAN DEFAULT NULL, IN p_CacheMustMatchConfig BOOLEAN DEFAULT NULL, IN p_PromptRole VARCHAR(20) DEFAULT NULL, IN p_PromptPosition VARCHAR(20) DEFAULT NULL, IN p_FailoverStrategy VARCHAR(50) DEFAULT NULL, IN p_FailoverModelStrategy VARCHAR(50) DEFAULT NULL, IN p_FailoverErrorScope VARCHAR(50) DEFAULT NULL)
RETURNS SETOF __mj."vwAIPrompts" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIPrompt"
            ("ID", "Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel")
        VALUES
            (p_ID, p_Name, p_Description, p_TemplateID, p_CategoryID, p_TypeID, p_Status, p_ResponseFormat, p_ModelSpecificResponseFormat, p_AIModelTypeID, p_MinPowerRank, p_SelectionStrategy, p_PowerPreference, p_ParallelizationMode, p_ParallelCount, p_ParallelConfigParam, p_OutputType, p_OutputExample, p_ValidationBehavior, p_MaxRetries, p_RetryDelayMS, p_RetryStrategy, p_ResultSelectorPromptID, p_EnableCaching, p_CacheTTLSeconds, p_CacheMatchType, p_CacheSimilarityThreshold, p_CacheMustMatchModel, p_CacheMustMatchVendor, p_CacheMustMatchAgent, p_CacheMustMatchConfig, p_PromptRole, p_PromptPosition, p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_IncludeLogProbs, p_TopLogProbs, p_FailoverStrategy, p_FailoverMaxAttempts, p_FailoverDelaySeconds, p_FailoverModelStrategy, p_FailoverErrorScope, p_EffortLevel)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIPrompt"
            ("Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel")
        VALUES
            (p_Name, p_Description, p_TemplateID, p_CategoryID, p_TypeID, p_Status, p_ResponseFormat, p_ModelSpecificResponseFormat, p_AIModelTypeID, p_MinPowerRank, p_SelectionStrategy, p_PowerPreference, p_ParallelizationMode, p_ParallelCount, p_ParallelConfigParam, p_OutputType, p_OutputExample, p_ValidationBehavior, p_MaxRetries, p_RetryDelayMS, p_RetryStrategy, p_ResultSelectorPromptID, p_EnableCaching, p_CacheTTLSeconds, p_CacheMatchType, p_CacheSimilarityThreshold, p_CacheMustMatchModel, p_CacheMustMatchVendor, p_CacheMustMatchAgent, p_CacheMustMatchConfig, p_PromptRole, p_PromptPosition, p_Temperature, p_TopP, p_TopK, p_MinP, p_FrequencyPenalty, p_PresencePenalty, p_Seed, p_StopSequences, p_IncludeLogProbs, p_TopLogProbs, p_FailoverStrategy, p_FailoverMaxAttempts, p_FailoverDelaySeconds, p_FailoverModelStrategy, p_FailoverErrorScope, p_EffortLevel)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIPrompts" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIKeyUsageLog"(IN p_ID UUID, IN p_APIKeyID UUID, IN p_Endpoint VARCHAR(500), IN p_Operation VARCHAR(255), IN p_Method VARCHAR(10), IN p_StatusCode INTEGER, IN p_ResponseTimeMs INTEGER, IN p_IPAddress VARCHAR(45), IN p_UserAgent VARCHAR(500), IN p_ApplicationID UUID, IN p_RequestedResource VARCHAR(500), IN p_ScopesEvaluated TEXT, IN p_AuthorizationResult VARCHAR(20), IN p_DeniedReason VARCHAR(500))
RETURNS SETOF __mj."vwAPIKeyUsageLogs" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."APIKeyUsageLog"
    SET
        "APIKeyID" = p_APIKeyID,
        "Endpoint" = p_Endpoint,
        "Operation" = p_Operation,
        "Method" = p_Method,
        "StatusCode" = p_StatusCode,
        "ResponseTimeMs" = p_ResponseTimeMs,
        "IPAddress" = p_IPAddress,
        "UserAgent" = p_UserAgent,
        "ApplicationID" = p_ApplicationID,
        "RequestedResource" = p_RequestedResource,
        "ScopesEvaluated" = p_ScopesEvaluated,
        "AuthorizationResult" = p_AuthorizationResult,
        "DeniedReason" = p_DeniedReason
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAPIKeyUsageLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModality"(IN p_ID UUID, IN p_Name VARCHAR(50), IN p_Description VARCHAR(500), IN p_ContentBlockType VARCHAR(50), IN p_MIMETypePattern VARCHAR(100), IN p_Type VARCHAR(50), IN p_DefaultMaxSizeBytes INTEGER, IN p_DefaultMaxCountPerMessage INTEGER, IN p_DisplayOrder INTEGER)
RETURNS SETOF __mj."vwAIModalities" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIModality"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ContentBlockType" = p_ContentBlockType,
        "MIMETypePattern" = p_MIMETypePattern,
        "Type" = p_Type,
        "DefaultMaxSizeBytes" = p_DefaultMaxSizeBytes,
        "DefaultMaxCountPerMessage" = p_DefaultMaxCountPerMessage,
        "DisplayOrder" = p_DisplayOrder
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIModalities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityAIAction"(IN p_EntityID UUID, IN p_AIModelID UUID, IN p_AIActionID UUID, IN p_Name VARCHAR(255), IN p_Prompt TEXT, IN p_UserMessage TEXT, IN p_OutputField VARCHAR(50), IN p_OutputEntityID UUID, IN p_Comments TEXT, IN p_ID UUID DEFAULT NULL, IN p_TriggerEvent CHAR(15) DEFAULT NULL, IN p_OutputType CHAR(10) DEFAULT NULL, IN p_SkipIfOutputFieldNotEmpty BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwEntityAIActions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EntityAIAction"
            ("ID", "EntityID", "AIModelID", "AIActionID", "Name", "Prompt", "TriggerEvent", "UserMessage", "OutputType", "OutputField", "SkipIfOutputFieldNotEmpty", "OutputEntityID", "Comments")
        VALUES
            (p_ID, p_EntityID, p_AIModelID, p_AIActionID, p_Name, p_Prompt, p_TriggerEvent, p_UserMessage, p_OutputType, p_OutputField, p_SkipIfOutputFieldNotEmpty, p_OutputEntityID, p_Comments)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EntityAIAction"
            ("EntityID", "AIModelID", "AIActionID", "Name", "Prompt", "TriggerEvent", "UserMessage", "OutputType", "OutputField", "SkipIfOutputFieldNotEmpty", "OutputEntityID", "Comments")
        VALUES
            (p_EntityID, p_AIModelID, p_AIActionID, p_Name, p_Prompt, p_TriggerEvent, p_UserMessage, p_OutputType, p_OutputField, p_SkipIfOutputFieldNotEmpty, p_OutputEntityID, p_Comments)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEntityAIActions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversation"(IN p_ID UUID, IN p_UserID UUID, IN p_ExternalID VARCHAR(500), IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Type VARCHAR(50), IN p_IsArchived BOOLEAN, IN p_LinkedEntityID UUID, IN p_LinkedRecordID VARCHAR(500), IN p_DataContextID UUID, IN p_Status VARCHAR(20), IN p_EnvironmentID UUID, IN p_ProjectID UUID, IN p_IsPinned BOOLEAN, IN p_TestRunID UUID)
RETURNS SETOF __mj."vwConversations" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Conversation"
    SET
        "UserID" = p_UserID,
        "ExternalID" = p_ExternalID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Type" = p_Type,
        "IsArchived" = p_IsArchived,
        "LinkedEntityID" = p_LinkedEntityID,
        "LinkedRecordID" = p_LinkedRecordID,
        "DataContextID" = p_DataContextID,
        "Status" = p_Status,
        "EnvironmentID" = p_EnvironmentID,
        "ProjectID" = p_ProjectID,
        "IsPinned" = p_IsPinned,
        "TestRunID" = p_TestRunID
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVectorDatabase"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_DefaultURL VARCHAR(255), IN p_ClassKey VARCHAR(100))
RETURNS SETOF __mj."vwVectorDatabases" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."VectorDatabase"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DefaultURL" = p_DefaultURL,
        "ClassKey" = p_ClassKey
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteActionResultCode"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ActionResultCode"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTest"(IN p_TypeID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_InputDefinition TEXT, IN p_ExpectedOutcomes TEXT, IN p_Configuration TEXT, IN p_Tags TEXT, IN p_Priority INTEGER, IN p_EstimatedDurationSeconds INTEGER, IN p_EstimatedCostUSD NUMERIC(10,6), IN p_RepeatCount INTEGER, IN p_MaxExecutionTimeMS INTEGER, IN p_Variables TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(20) DEFAULT NULL)
RETURNS SETOF __mj."vwTests" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Test"
            ("ID", "TypeID", "Name", "Description", "Status", "InputDefinition", "ExpectedOutcomes", "Configuration", "Tags", "Priority", "EstimatedDurationSeconds", "EstimatedCostUSD", "RepeatCount", "MaxExecutionTimeMS", "Variables")
        VALUES
            (p_ID, p_TypeID, p_Name, p_Description, p_Status, p_InputDefinition, p_ExpectedOutcomes, p_Configuration, p_Tags, p_Priority, p_EstimatedDurationSeconds, p_EstimatedCostUSD, p_RepeatCount, p_MaxExecutionTimeMS, p_Variables)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Test"
            ("TypeID", "Name", "Description", "Status", "InputDefinition", "ExpectedOutcomes", "Configuration", "Tags", "Priority", "EstimatedDurationSeconds", "EstimatedCostUSD", "RepeatCount", "MaxExecutionTimeMS", "Variables")
        VALUES
            (p_TypeID, p_Name, p_Description, p_Status, p_InputDefinition, p_ExpectedOutcomes, p_Configuration, p_Tags, p_Priority, p_EstimatedDurationSeconds, p_EstimatedCostUSD, p_RepeatCount, p_MaxExecutionTimeMS, p_Variables)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwTests" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateGeneratedCodeCategory"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ParentID UUID)
RETURNS SETOF __mj."vwGeneratedCodeCategories" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKeyApplication"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."APIKeyApplication"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."AIPromptType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateQueryEntity"(IN p_ID UUID, IN p_QueryID UUID, IN p_EntityID UUID, IN p_DetectionMethod VARCHAR(50), IN p_AutoDetectConfidenceScore NUMERIC(3,2))
RETURNS SETOF __mj."vwQueryEntities" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."QueryEntity"
    SET
        "QueryID" = p_QueryID,
        "EntityID" = p_EntityID,
        "DetectionMethod" = p_DetectionMethod,
        "AutoDetectConfidenceScore" = p_AutoDetectConfidenceScore
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwQueryEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTest"(IN p_ID UUID, IN p_TypeID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_Status VARCHAR(20), IN p_InputDefinition TEXT, IN p_ExpectedOutcomes TEXT, IN p_Configuration TEXT, IN p_Tags TEXT, IN p_Priority INTEGER, IN p_EstimatedDurationSeconds INTEGER, IN p_EstimatedCostUSD NUMERIC(10,6), IN p_RepeatCount INTEGER, IN p_MaxExecutionTimeMS INTEGER, IN p_Variables TEXT)
RETURNS SETOF __mj."vwTests" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."Test"
    SET
        "TypeID" = p_TypeID,
        "Name" = p_Name,
        "Description" = p_Description,
        "Status" = p_Status,
        "InputDefinition" = p_InputDefinition,
        "ExpectedOutcomes" = p_ExpectedOutcomes,
        "Configuration" = p_Configuration,
        "Tags" = p_Tags,
        "Priority" = p_Priority,
        "EstimatedDurationSeconds" = p_EstimatedDurationSeconds,
        "EstimatedCostUSD" = p_EstimatedCostUSD,
        "RepeatCount" = p_RepeatCount,
        "MaxExecutionTimeMS" = p_MaxExecutionTimeMS,
        "Variables" = p_Variables
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwTests" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKeyUsageLog"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."APIKeyUsageLog"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentLearningCycle"(IN p_AgentID UUID, IN p_EndedAt TIMESTAMPTZ, IN p_Status VARCHAR(20), IN p_AgentSummary TEXT, IN p_ID UUID DEFAULT NULL, IN p_StartedAt TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwAIAgentLearningCycles" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentLearningCycle"
            ("ID", "AgentID", "StartedAt", "EndedAt", "Status", "AgentSummary")
        VALUES
            (p_ID, p_AgentID, p_StartedAt, p_EndedAt, p_Status, p_AgentSummary)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."AIAgentLearningCycle"
            ("AgentID", "StartedAt", "EndedAt", "Status", "AgentSummary")
        VALUES
            (p_AgentID, p_StartedAt, p_EndedAt, p_Status, p_AgentSummary)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentLearningCycles" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactType"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_ContentType VARCHAR(100), IN p_IsEnabled BOOLEAN, IN p_ParentID UUID, IN p_ExtractRules TEXT, IN p_DriverClass VARCHAR(255), IN p_Icon VARCHAR(255))
RETURNS SETOF __mj."vwArtifactTypes" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAuthorizationRole"(IN p_ID UUID, IN p_AuthorizationID UUID, IN p_RoleID UUID, IN p_Type CHAR(10))
RETURNS SETOF __mj."vwAuthorizationRoles" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AuthorizationRole"
    SET
        "AuthorizationID" = p_AuthorizationID,
        "RoleID" = p_RoleID,
        "Type" = p_Type
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAuthorizationRoles" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIConfiguration"(IN p_ID UUID, IN p_Name VARCHAR(100), IN p_Description TEXT, IN p_IsDefault BOOLEAN, IN p_Status VARCHAR(20), IN p_DefaultPromptForContextCompressionID UUID, IN p_DefaultPromptForContextSummarizationID UUID, IN p_DefaultStorageProviderID UUID, IN p_DefaultStorageRootPath VARCHAR(500), IN p_ParentID UUID)
RETURNS SETOF __mj."vwAIConfigurations" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserRole"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."UserRole"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactUse"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ArtifactUse"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCommunicationProviderMessageType"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."CommunicationProviderMessageType"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteApplicationEntity"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."ApplicationEntity"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAPIApplicationScope"(IN p_ApplicationID UUID, IN p_ScopeID UUID, IN p_ResourcePattern VARCHAR(750), IN p_ID UUID DEFAULT NULL, IN p_PatternType VARCHAR(20) DEFAULT NULL, IN p_IsDeny BOOLEAN DEFAULT NULL, IN p_Priority INTEGER DEFAULT NULL)
RETURNS SETOF __mj."vwAPIApplicationScopes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."APIApplicationScope"
            ("ID", "ApplicationID", "ScopeID", "ResourcePattern", "PatternType", "IsDeny", "Priority")
        VALUES
            (p_ID, p_ApplicationID, p_ScopeID, p_ResourcePattern, p_PatternType, p_IsDeny, p_Priority)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."APIApplicationScope"
            ("ApplicationID", "ScopeID", "ResourcePattern", "PatternType", "IsDeny", "Priority")
        VALUES
            (p_ApplicationID, p_ScopeID, p_ResourcePattern, p_PatternType, p_IsDeny, p_Priority)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAPIApplicationScopes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateQueue"(IN p_Name VARCHAR(50), IN p_Description TEXT, IN p_QueueTypeID UUID, IN p_ProcessPID INTEGER, IN p_ProcessPlatform VARCHAR(30), IN p_ProcessVersion VARCHAR(15), IN p_ProcessCwd VARCHAR(100), IN p_ProcessIPAddress VARCHAR(50), IN p_ProcessMacAddress VARCHAR(50), IN p_ProcessOSName VARCHAR(25), IN p_ProcessOSVersion VARCHAR(10), IN p_ProcessHostName VARCHAR(50), IN p_ProcessUserID VARCHAR(25), IN p_ProcessUserName VARCHAR(50), IN p_ID UUID DEFAULT NULL, IN p_IsActive BOOLEAN DEFAULT NULL, IN p_LastHeartbeat TIMESTAMPTZ DEFAULT NULL)
RETURNS SETOF __mj."vwQueues" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."Queue"
            ("ID", "Name", "Description", "QueueTypeID", "IsActive", "ProcessPID", "ProcessPlatform", "ProcessVersion", "ProcessCwd", "ProcessIPAddress", "ProcessMacAddress", "ProcessOSName", "ProcessOSVersion", "ProcessHostName", "ProcessUserID", "ProcessUserName", "LastHeartbeat")
        VALUES
            (p_ID, p_Name, p_Description, p_QueueTypeID, p_IsActive, p_ProcessPID, p_ProcessPlatform, p_ProcessVersion, p_ProcessCwd, p_ProcessIPAddress, p_ProcessMacAddress, p_ProcessOSName, p_ProcessOSVersion, p_ProcessHostName, p_ProcessUserID, p_ProcessUserName, p_LastHeartbeat)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."Queue"
            ("Name", "Description", "QueueTypeID", "IsActive", "ProcessPID", "ProcessPlatform", "ProcessVersion", "ProcessCwd", "ProcessIPAddress", "ProcessMacAddress", "ProcessOSName", "ProcessOSVersion", "ProcessHostName", "ProcessUserID", "ProcessUserName", "LastHeartbeat")
        VALUES
            (p_Name, p_Description, p_QueueTypeID, p_IsActive, p_ProcessPID, p_ProcessPlatform, p_ProcessVersion, p_ProcessCwd, p_ProcessIPAddress, p_ProcessMacAddress, p_ProcessOSName, p_ProcessOSVersion, p_ProcessHostName, p_ProcessUserID, p_ProcessUserName, p_LastHeartbeat)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwQueues" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateContentFileType"(IN p_Name VARCHAR(255), IN p_FileExtension VARCHAR(255), IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwContentFileTypes" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ContentFileType"
            ("ID", "Name", "FileExtension")
        VALUES
            (p_ID, p_Name, p_FileExtension)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ContentFileType"
            ("Name", "FileExtension")
        VALUES
            (p_Name, p_FileExtension)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwContentFileTypes" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEmployee"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Employee"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteTest"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Test"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateMCPServer"(IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ServerURL VARCHAR(1000), IN p_Command VARCHAR(500), IN p_CommandArgs TEXT, IN p_TransportType VARCHAR(50), IN p_DefaultAuthType VARCHAR(50), IN p_CredentialTypeID UUID, IN p_LastSyncAt TIMESTAMPTZ, IN p_RateLimitPerMinute INTEGER, IN p_RateLimitPerHour INTEGER, IN p_ConnectionTimeoutMs INTEGER, IN p_RequestTimeoutMs INTEGER, IN p_DocumentationURL VARCHAR(1000), IN p_IconClass VARCHAR(100), IN p_OAuthIssuerURL VARCHAR(1000), IN p_OAuthScopes VARCHAR(500), IN p_OAuthMetadataCacheTTLMinutes INTEGER, IN p_OAuthClientID VARCHAR(255), IN p_OAuthClientSecretEncrypted TEXT, IN p_ID UUID DEFAULT NULL, IN p_Status VARCHAR(50) DEFAULT NULL, IN p_OAuthRequirePKCE BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwMCPServers" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."MCPServer"
            ("ID", "Name", "Description", "ServerURL", "Command", "CommandArgs", "TransportType", "DefaultAuthType", "CredentialTypeID", "Status", "LastSyncAt", "RateLimitPerMinute", "RateLimitPerHour", "ConnectionTimeoutMs", "RequestTimeoutMs", "DocumentationURL", "IconClass", "OAuthIssuerURL", "OAuthScopes", "OAuthMetadataCacheTTLMinutes", "OAuthClientID", "OAuthClientSecretEncrypted", "OAuthRequirePKCE")
        VALUES
            (p_ID, p_Name, p_Description, p_ServerURL, p_Command, p_CommandArgs, p_TransportType, p_DefaultAuthType, p_CredentialTypeID, p_Status, p_LastSyncAt, p_RateLimitPerMinute, p_RateLimitPerHour, p_ConnectionTimeoutMs, p_RequestTimeoutMs, p_DocumentationURL, p_IconClass, p_OAuthIssuerURL, p_OAuthScopes, p_OAuthMetadataCacheTTLMinutes, p_OAuthClientID, p_OAuthClientSecretEncrypted, p_OAuthRequirePKCE)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."MCPServer"
            ("Name", "Description", "ServerURL", "Command", "CommandArgs", "TransportType", "DefaultAuthType", "CredentialTypeID", "Status", "LastSyncAt", "RateLimitPerMinute", "RateLimitPerHour", "ConnectionTimeoutMs", "RequestTimeoutMs", "DocumentationURL", "IconClass", "OAuthIssuerURL", "OAuthScopes", "OAuthMetadataCacheTTLMinutes", "OAuthClientID", "OAuthClientSecretEncrypted", "OAuthRequirePKCE")
        VALUES
            (p_Name, p_Description, p_ServerURL, p_Command, p_CommandArgs, p_TransportType, p_DefaultAuthType, p_CredentialTypeID, p_Status, p_LastSyncAt, p_RateLimitPerMinute, p_RateLimitPerHour, p_ConnectionTimeoutMs, p_RequestTimeoutMs, p_DocumentationURL, p_IconClass, p_OAuthIssuerURL, p_OAuthScopes, p_OAuthMetadataCacheTTLMinutes, p_OAuthClientID, p_OAuthClientSecretEncrypted, p_OAuthRequirePKCE)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwMCPServers" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserFavorite"(IN p_ID UUID, IN p_UserID UUID, IN p_EntityID UUID, IN p_RecordID VARCHAR(450))
RETURNS SETOF __mj."vwUserFavorites" AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegration"(IN p_CompanyID UUID, IN p_IntegrationID UUID, IN p_IsActive BOOLEAN, IN p_AccessToken VARCHAR(255), IN p_RefreshToken VARCHAR(255), IN p_TokenExpirationDate TIMESTAMPTZ, IN p_APIKey VARCHAR(255), IN p_ExternalSystemID VARCHAR(100), IN p_ClientID VARCHAR(255), IN p_ClientSecret VARCHAR(255), IN p_CustomAttribute1 VARCHAR(255), IN p_Name VARCHAR(255), IN p_ID UUID DEFAULT NULL, IN p_IsExternalSystemReadOnly BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwCompanyIntegrations" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."CompanyIntegration"
            ("ID", "CompanyID", "IntegrationID", "IsActive", "AccessToken", "RefreshToken", "TokenExpirationDate", "APIKey", "ExternalSystemID", "IsExternalSystemReadOnly", "ClientID", "ClientSecret", "CustomAttribute1", "Name")
        VALUES
            (p_ID, p_CompanyID, p_IntegrationID, p_IsActive, p_AccessToken, p_RefreshToken, p_TokenExpirationDate, p_APIKey, p_ExternalSystemID, p_IsExternalSystemReadOnly, p_ClientID, p_ClientSecret, p_CustomAttribute1, p_Name)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."CompanyIntegration"
            ("CompanyID", "IntegrationID", "IsActive", "AccessToken", "RefreshToken", "TokenExpirationDate", "APIKey", "ExternalSystemID", "IsExternalSystemReadOnly", "ClientID", "ClientSecret", "CustomAttribute1", "Name")
        VALUES
            (p_CompanyID, p_IntegrationID, p_IsActive, p_AccessToken, p_RefreshToken, p_TokenExpirationDate, p_APIKey, p_ExternalSystemID, p_IsExternalSystemReadOnly, p_ClientID, p_ClientSecret, p_CustomAttribute1, p_Name)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrations" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactPermission"(IN p_ArtifactID UUID, IN p_UserID UUID, IN p_SharedByUserID UUID, IN p_ID UUID DEFAULT NULL, IN p_CanRead BOOLEAN DEFAULT NULL, IN p_CanEdit BOOLEAN DEFAULT NULL, IN p_CanDelete BOOLEAN DEFAULT NULL, IN p_CanShare BOOLEAN DEFAULT NULL)
RETURNS SETOF __mj."vwArtifactPermissions" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."ArtifactPermission"
            ("ID", "ArtifactID", "UserID", "CanRead", "CanEdit", "CanDelete", "CanShare", "SharedByUserID")
        VALUES
            (p_ID, p_ArtifactID, p_UserID, p_CanRead, p_CanEdit, p_CanDelete, p_CanShare, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."ArtifactPermission"
            ("ArtifactID", "UserID", "CanRead", "CanEdit", "CanDelete", "CanShare", "SharedByUserID")
        VALUES
            (p_ArtifactID, p_UserID, p_CanRead, p_CanEdit, p_CanDelete, p_CanShare, p_SharedByUserID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwArtifactPermissions" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIApplicationScope"(IN p_ID UUID, IN p_ApplicationID UUID, IN p_ScopeID UUID, IN p_ResourcePattern VARCHAR(750), IN p_PatternType VARCHAR(20), IN p_IsDeny BOOLEAN, IN p_Priority INTEGER)
RETURNS SETOF __mj."vwAPIApplicationScopes" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."APIApplicationScope"
    SET
        "ApplicationID" = p_ApplicationID,
        "ScopeID" = p_ScopeID,
        "ResourcePattern" = p_ResourcePattern,
        "PatternType" = p_PatternType,
        "IsDeny" = p_IsDeny,
        "Priority" = p_Priority
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAPIApplicationScopes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRequest"(IN p_ID UUID, IN p_AgentID UUID, IN p_RequestedAt TIMESTAMPTZ, IN p_RequestForUserID UUID, IN p_Status VARCHAR(20), IN p_Request TEXT, IN p_Response TEXT, IN p_ResponseByUserID UUID, IN p_RespondedAt TIMESTAMPTZ, IN p_Comments TEXT)
RETURNS SETOF __mj."vwAIAgentRequests" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."AIAgentRequest"
    SET
        "AgentID" = p_AgentID,
        "RequestedAt" = p_RequestedAt,
        "RequestForUserID" = p_RequestForUserID,
        "Status" = p_Status,
        "Request" = p_Request,
        "Response" = p_Response,
        "ResponseByUserID" = p_ResponseByUserID,
        "RespondedAt" = p_RespondedAt,
        "Comments" = p_Comments
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateWorkflowRun"(IN p_ID UUID, IN p_WorkflowID UUID, IN p_ExternalSystemRecordID VARCHAR(500), IN p_StartedAt TIMESTAMPTZ, IN p_EndedAt TIMESTAMPTZ, IN p_Status CHAR(10), IN p_Results TEXT)
RETURNS SETOF __mj."vwWorkflowRuns" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."WorkflowRun"
    SET
        "WorkflowID" = p_WorkflowID,
        "ExternalSystemRecordID" = p_ExternalSystemRecordID,
        "StartedAt" = p_StartedAt,
        "EndedAt" = p_EndedAt,
        "Status" = p_Status,
        "Results" = p_Results
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwWorkflowRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateMCPServer"(IN p_ID UUID, IN p_Name VARCHAR(255), IN p_Description TEXT, IN p_ServerURL VARCHAR(1000), IN p_Command VARCHAR(500), IN p_CommandArgs TEXT, IN p_TransportType VARCHAR(50), IN p_DefaultAuthType VARCHAR(50), IN p_CredentialTypeID UUID, IN p_Status VARCHAR(50), IN p_LastSyncAt TIMESTAMPTZ, IN p_RateLimitPerMinute INTEGER, IN p_RateLimitPerHour INTEGER, IN p_ConnectionTimeoutMs INTEGER, IN p_RequestTimeoutMs INTEGER, IN p_DocumentationURL VARCHAR(1000), IN p_IconClass VARCHAR(100), IN p_OAuthIssuerURL VARCHAR(1000), IN p_OAuthScopes VARCHAR(500), IN p_OAuthMetadataCacheTTLMinutes INTEGER, IN p_OAuthClientID VARCHAR(255), IN p_OAuthClientSecretEncrypted TEXT, IN p_OAuthRequirePKCE BOOLEAN)
RETURNS SETOF __mj."vwMCPServers" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."MCPServer"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ServerURL" = p_ServerURL,
        "Command" = p_Command,
        "CommandArgs" = p_CommandArgs,
        "TransportType" = p_TransportType,
        "DefaultAuthType" = p_DefaultAuthType,
        "CredentialTypeID" = p_CredentialTypeID,
        "Status" = p_Status,
        "LastSyncAt" = p_LastSyncAt,
        "RateLimitPerMinute" = p_RateLimitPerMinute,
        "RateLimitPerHour" = p_RateLimitPerHour,
        "ConnectionTimeoutMs" = p_ConnectionTimeoutMs,
        "RequestTimeoutMs" = p_RequestTimeoutMs,
        "DocumentationURL" = p_DocumentationURL,
        "IconClass" = p_IconClass,
        "OAuthIssuerURL" = p_OAuthIssuerURL,
        "OAuthScopes" = p_OAuthScopes,
        "OAuthMetadataCacheTTLMinutes" = p_OAuthMetadataCacheTTLMinutes,
        "OAuthClientID" = p_OAuthClientID,
        "OAuthClientSecretEncrypted" = p_OAuthClientSecretEncrypted,
        "OAuthRequirePKCE" = p_OAuthRequirePKCE
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwMCPServers" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordLink"(IN p_ID UUID, IN p_SourceEntityID UUID, IN p_SourceRecordID VARCHAR(500), IN p_TargetEntityID UUID, IN p_TargetRecordID VARCHAR(500), IN p_LinkType VARCHAR(50), IN p_Sequence INTEGER, IN p_Metadata TEXT)
RETURNS SETOF __mj."vwRecordLinks" AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."RecordLink"
    SET
        "SourceEntityID" = p_SourceEntityID,
        "SourceRecordID" = p_SourceRecordID,
        "TargetEntityID" = p_TargetEntityID,
        "TargetRecordID" = p_TargetRecordID,
        "LinkType" = p_LinkType,
        "Sequence" = p_Sequence,
        "Metadata" = p_Metadata
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."vwRecordLinks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteApplication"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Application"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEmployeeRole"(IN p_EmployeeID UUID, IN p_RoleID UUID, IN p_ID UUID DEFAULT NULL)
RETURNS SETOF __mj."vwEmployeeRoles" AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."EmployeeRole"
            ("ID", "EmployeeID", "RoleID")
        VALUES
            (p_ID, p_EmployeeID, p_RoleID)
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."EmployeeRole"
            ("EmployeeID", "RoleID")
        VALUES
            (p_EmployeeID, p_RoleID)
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwEmployeeRoles" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifact"(IN p_ID UUID)
RETURNS TABLE("ID" UUID) AS $$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."Artifact"
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_ID AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

-- SKIPPED utility procedure: CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spCreateEntityBehaviorType (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spCreateEntityBehavior (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spDeleteEntityBehaviorType (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spDeleteEntityBehavior (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spRecompileAllProceduresInDependencyOrder (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spRecompileAllViews (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spUpdateEntityBehaviorType (needs manual rewrite for PostgreSQL)

-- SKIPPED utility procedure: spUpdateEntityBehavior (needs manual rewrite for PostgreSQL)

