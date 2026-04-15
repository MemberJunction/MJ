-- Create 24 missing views in PG database
-- These views exist in SQL Server baseline but were not included in PG baseline

-- 1. vwEntities (critical - many views depend on this)
DROP VIEW IF EXISTS __mj."vwEntities" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntities" AS
SELECT
    e.*,
    __mj."GetProgrammaticName"(
        COALESCE(__mj."StripToAlphanumeric"(si."EntityNamePrefix"), '') ||
        REPLACE(
            CASE WHEN si."EntityNamePrefix" IS NOT NULL
                THEN REPLACE(e."Name", si."EntityNamePrefix", '')
                ELSE e."Name"
            END,
            ' ',
            ''
        )
    ) AS "CodeName",
    __mj."GetProgrammaticName"(
        COALESCE(__mj."StripToAlphanumeric"(si."EntityNamePrefix"), '') ||
        e."BaseTable" ||
        COALESCE(e."NameSuffix", '')
    ) AS "ClassName",
    __mj."GetProgrammaticName"(e."BaseTable" || COALESCE(e."NameSuffix", '')) AS "BaseTableCodeName",
    par."Name" AS "ParentEntity",
    par."BaseTable" AS "ParentBaseTable",
    par."BaseView" AS "ParentBaseView"
FROM
    __mj."Entity" e
LEFT OUTER JOIN
    __mj."Entity" par
ON
    e."ParentID" = par."ID"
LEFT OUTER JOIN
    __mj."SchemaInfo" si
ON
    e."SchemaName" = si."SchemaName";

-- 2. vwEntityFields (depends on vwEntities)
DROP VIEW IF EXISTS __mj."vwEntityFields" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntityFields" AS
SELECT
    ef.*,
    __mj."GetProgrammaticName"(REPLACE(ef."Name", ' ', '')) AS "FieldCodeName",
    e."Name" AS "Entity",
    e."SchemaName",
    e."BaseTable",
    e."BaseView",
    e."CodeName" AS "EntityCodeName",
    e."ClassName" AS "EntityClassName",
    re."Name" AS "RelatedEntity",
    re."SchemaName" AS "RelatedEntitySchemaName",
    re."BaseTable" AS "RelatedEntityBaseTable",
    re."BaseView" AS "RelatedEntityBaseView",
    re."CodeName" AS "RelatedEntityCodeName",
    re."ClassName" AS "RelatedEntityClassName"
FROM
    __mj."EntityField" ef
INNER JOIN
    __mj."vwEntities" e ON ef."EntityID" = e."ID"
LEFT OUTER JOIN
    __mj."vwEntities" re ON ef."RelatedEntityID" = re."ID";

-- 3. vwEntityFieldValues (depends on vwEntityFields)
DROP VIEW IF EXISTS __mj."vwEntityFieldValues" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntityFieldValues" AS
SELECT
    efv.*,
    ef."Name" AS "EntityField",
    ef."Entity",
    ef."EntityID"
FROM
    __mj."EntityFieldValue" efv
INNER JOIN
    __mj."vwEntityFields" ef ON efv."EntityFieldID" = ef."ID";

-- 4. vwEntityRelationships (depends on vwEntities)
DROP VIEW IF EXISTS __mj."vwEntityRelationships" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntityRelationships" AS
SELECT
    er.*,
    e."Name" AS "Entity",
    e."BaseTable" AS "EntityBaseTable",
    e."BaseView" AS "EntityBaseView",
    "relatedEntity"."Name" AS "RelatedEntity",
    "relatedEntity"."BaseTable" AS "RelatedEntityBaseTable",
    "relatedEntity"."BaseView" AS "RelatedEntityBaseView",
    "relatedEntity"."ClassName" AS "RelatedEntityClassName",
    "relatedEntity"."CodeName" AS "RelatedEntityCodeName",
    "relatedEntity"."BaseTableCodeName" AS "RelatedEntityBaseTableCodeName",
    uv."Name" AS "DisplayUserViewName"
FROM
    __mj."EntityRelationship" er
INNER JOIN
    __mj."Entity" e ON er."EntityID" = e."ID"
INNER JOIN
    __mj."vwEntities" "relatedEntity" ON er."RelatedEntityID" = "relatedEntity"."ID"
LEFT OUTER JOIN
    __mj."UserView" uv ON er."DisplayUserViewID" = uv."ID";

-- 5. vwRecordChanges
DROP VIEW IF EXISTS __mj."vwRecordChanges" CASCADE;
CREATE OR REPLACE VIEW __mj."vwRecordChanges" AS
SELECT
    r.*,
    e."Name" AS "Entity",
    u."Name" AS "User",
    i."Name" AS "Integration"
FROM
    __mj."RecordChange" r
INNER JOIN
    __mj."Entity" e ON r."EntityID" = e."ID"
INNER JOIN
    __mj."User" u ON r."UserID" = u."ID"
LEFT OUTER JOIN
    __mj."Integration" i ON r."IntegrationID" = i."ID";

-- 6. vwEntityActionFilters
DROP VIEW IF EXISTS __mj."vwEntityActionFilters" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntityActionFilters" AS
SELECT e.* FROM __mj."EntityActionFilter" e;

-- 7. vwEntityActionInvocations
DROP VIEW IF EXISTS __mj."vwEntityActionInvocations" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntityActionInvocations" AS
SELECT
    e.*,
    eit."Name" AS "InvocationType"
FROM
    __mj."EntityActionInvocation" e
INNER JOIN
    __mj."EntityActionInvocationType" eit ON e."InvocationTypeID" = eit."ID";

-- 8. vwEntityActionParams
DROP VIEW IF EXISTS __mj."vwEntityActionParams" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntityActionParams" AS
SELECT
    e.*,
    ap."Name" AS "ActionParam"
FROM
    __mj."EntityActionParam" e
INNER JOIN
    __mj."ActionParam" ap ON e."ActionParamID" = ap."ID";

-- 9. vwEntityCommunicationFields
DROP VIEW IF EXISTS __mj."vwEntityCommunicationFields" CASCADE;
CREATE OR REPLACE VIEW __mj."vwEntityCommunicationFields" AS
SELECT e.* FROM __mj."EntityCommunicationField" e;

-- 10. vwDuplicateRunDetails
DROP VIEW IF EXISTS __mj."vwDuplicateRunDetails" CASCADE;
CREATE OR REPLACE VIEW __mj."vwDuplicateRunDetails" AS
SELECT d.* FROM __mj."DuplicateRunDetail" d;

-- 11. vwConversations
DROP VIEW IF EXISTS __mj."vwConversations" CASCADE;
CREATE OR REPLACE VIEW __mj."vwConversations" AS
SELECT
    c.*,
    u."Name" AS "User",
    ent."Name" AS "LinkedEntity",
    dc."Name" AS "DataContext",
    env."Name" AS "Environment",
    p."Name" AS "Project"
FROM
    __mj."Conversation" c
INNER JOIN
    __mj."User" u ON c."UserID" = u."ID"
LEFT OUTER JOIN
    __mj."Entity" ent ON c."LinkedEntityID" = ent."ID"
LEFT OUTER JOIN
    __mj."DataContext" dc ON c."DataContextID" = dc."ID"
INNER JOIN
    __mj."Environment" env ON c."EnvironmentID" = env."ID"
LEFT OUTER JOIN
    __mj."Project" p ON c."ProjectID" = p."ID";

-- 12. vwTestRuns (needed by vwTestRunFeedbacks, vwAIAgentRuns, etc.)
DROP VIEW IF EXISTS __mj."vwTestRuns" CASCADE;
CREATE OR REPLACE VIEW __mj."vwTestRuns" AS
SELECT
    t.*,
    test."Name" AS "Test",
    tsr."Suite" AS "TestSuiteRun",
    u."Name" AS "RunByUser",
    ent."Name" AS "TargetLogEntity"
FROM
    __mj."TestRun" t
INNER JOIN
    __mj."Test" test ON t."TestID" = test."ID"
LEFT OUTER JOIN
    __mj."vwTestSuiteRuns" tsr ON t."TestSuiteRunID" = tsr."ID"
INNER JOIN
    __mj."User" u ON t."RunByUserID" = u."ID"
LEFT OUTER JOIN
    __mj."Entity" ent ON t."TargetLogEntityID" = ent."ID";

-- 13. vwTestRunFeedbacks (depends on vwTestRuns)
DROP VIEW IF EXISTS __mj."vwTestRunFeedbacks" CASCADE;
CREATE OR REPLACE VIEW __mj."vwTestRunFeedbacks" AS
SELECT
    t.*,
    tr."Test" AS "TestRun",
    u."Name" AS "ReviewerUser"
FROM
    __mj."TestRunFeedback" t
INNER JOIN
    __mj."vwTestRuns" tr ON t."TestRunID" = tr."ID"
INNER JOIN
    __mj."User" u ON t."ReviewerUserID" = u."ID";

-- 14. vwTestRunOutputs
DROP VIEW IF EXISTS __mj."vwTestRunOutputs" CASCADE;
CREATE OR REPLACE VIEW __mj."vwTestRunOutputs" AS
SELECT
    t.*,
    tr."Test" AS "TestRun"
FROM
    __mj."TestRunOutput" t
INNER JOIN
    __mj."vwTestRuns" tr ON t."TestRunID" = tr."ID";

-- 15. vwConversationDetails (depends on vwTestRuns)
DROP VIEW IF EXISTS __mj."vwConversationDetails" CASCADE;
CREATE OR REPLACE VIEW __mj."vwConversationDetails" AS
SELECT
    c.*,
    conv."Name" AS "Conversation",
    u."Name" AS "User",
    ca."Name" AS "Artifact",
    cav."ConversationArtifact" AS "ArtifactVersion",
    par."Message" AS "Parent",
    ag."Name" AS "Agent",
    tr."Test" AS "TestRun",
    root_parent."RootID" AS "RootParentID"
FROM
    __mj."ConversationDetail" c
INNER JOIN
    __mj."Conversation" conv ON c."ConversationID" = conv."ID"
LEFT OUTER JOIN
    __mj."User" u ON c."UserID" = u."ID"
LEFT OUTER JOIN
    __mj."ConversationArtifact" ca ON c."ArtifactID" = ca."ID"
LEFT OUTER JOIN
    __mj."vwConversationArtifactVersions" cav ON c."ArtifactVersionID" = cav."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" par ON c."ParentID" = par."ID"
LEFT OUTER JOIN
    __mj."AIAgent" ag ON c."AgentID" = ag."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" tr ON c."TestRunID" = tr."ID"
LEFT JOIN LATERAL
    __mj."fnConversationDetailParentID_GetRootID"(c."ID", c."ParentID") AS root_parent ON true;

-- 16. vwAIModels
DROP VIEW IF EXISTS __mj."vwAIModels" CASCADE;
CREATE OR REPLACE VIEW __mj."vwAIModels" AS
SELECT
    m.*,
    amt."Name" AS "AIModelType",
    v."Name" AS "Vendor",
    mv."DriverClass",
    mv."DriverImportPath",
    mv."APIName",
    mv."MaxInputTokens" AS "InputTokenLimit",
    mv."SupportedResponseFormats",
    mv."SupportsEffortLevel"
FROM
    __mj."AIModel" m
INNER JOIN
    __mj."AIModelType" amt ON m."AIModelTypeID" = amt."ID"
LEFT JOIN LATERAL (
    SELECT
        amv."ModelID",
        amv."DriverClass",
        amv."DriverImportPath",
        amv."APIName",
        amv."MaxInputTokens",
        amv."SupportedResponseFormats",
        amv."SupportsEffortLevel",
        amv."VendorID"
    FROM
        __mj."vwAIModelVendors" amv
    WHERE
        amv."ModelID" = m."ID"
        AND amv."Status" = 'Active'
        AND amv."Type" = 'Inference Provider'
    ORDER BY
        amv."Priority" DESC
    LIMIT 1
) mv ON true
LEFT JOIN __mj."AIVendor" v ON mv."VendorID" = v."ID";

-- 17. vwAICredentialBindings
DROP VIEW IF EXISTS __mj."vwAICredentialBindings" CASCADE;
CREATE OR REPLACE VIEW __mj."vwAICredentialBindings" AS
SELECT
    a.*,
    cred."Name" AS "Credential",
    av."Name" AS "AIVendor",
    amv."Model" AS "AIModelVendor",
    apm."Prompt" AS "AIPromptModel"
FROM
    __mj."AICredentialBinding" a
INNER JOIN
    __mj."Credential" cred ON a."CredentialID" = cred."ID"
LEFT OUTER JOIN
    __mj."AIVendor" av ON a."AIVendorID" = av."ID"
LEFT OUTER JOIN
    __mj."vwAIModelVendors" amv ON a."AIModelVendorID" = amv."ID"
LEFT OUTER JOIN
    __mj."vwAIPromptModels" apm ON a."AIPromptModelID" = apm."ID";

-- 18. vwAIAgentRuns (depends on vwTestRuns)
DROP VIEW IF EXISTS __mj."vwAIAgentRuns" CASCADE;
CREATE OR REPLACE VIEW __mj."vwAIAgentRuns" AS
SELECT
    a.*,
    ag."Name" AS "Agent",
    par."RunName" AS "ParentRun",
    conv."Name" AS "Conversation",
    u."Name" AS "User",
    cd."Message" AS "ConversationDetail",
    lr."RunName" AS "LastRun",
    cfg."Name" AS "Configuration",
    om."Name" AS "OverrideModel",
    ov."Name" AS "OverrideVendor",
    sjr."ScheduledJob" AS "ScheduledJobRun",
    tr."Test" AS "TestRun",
    pse."Name" AS "PrimaryScopeEntity",
    root_parent."RootID" AS "RootParentRunID",
    root_last."RootID" AS "RootLastRunID"
FROM
    __mj."AIAgentRun" a
INNER JOIN
    __mj."AIAgent" ag ON a."AgentID" = ag."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" par ON a."ParentRunID" = par."ID"
LEFT OUTER JOIN
    __mj."Conversation" conv ON a."ConversationID" = conv."ID"
LEFT OUTER JOIN
    __mj."User" u ON a."UserID" = u."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" cd ON a."ConversationDetailID" = cd."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" lr ON a."LastRunID" = lr."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" cfg ON a."ConfigurationID" = cfg."ID"
LEFT OUTER JOIN
    __mj."AIModel" om ON a."OverrideModelID" = om."ID"
LEFT OUTER JOIN
    __mj."AIVendor" ov ON a."OverrideVendorID" = ov."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" sjr ON a."ScheduledJobRunID" = sjr."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" tr ON a."TestRunID" = tr."ID"
LEFT OUTER JOIN
    __mj."Entity" pse ON a."PrimaryScopeEntityID" = pse."ID"
LEFT JOIN LATERAL
    __mj."fnAIAgentRunParentRunID_GetRootID"(a."ID", a."ParentRunID") AS root_parent ON true
LEFT JOIN LATERAL
    __mj."fnAIAgentRunLastRunID_GetRootID"(a."ID", a."LastRunID") AS root_last ON true;

-- 19. vwAIPromptRuns (depends on vwTestRuns)
DROP VIEW IF EXISTS __mj."vwAIPromptRuns" CASCADE;
CREATE OR REPLACE VIEW __mj."vwAIPromptRuns" AS
SELECT
    a.*,
    p."Name" AS "Prompt",
    m."Name" AS "Model",
    v."Name" AS "Vendor",
    ag."Name" AS "Agent",
    cfg."Name" AS "Configuration",
    par."RunName" AS "Parent",
    ar."RunName" AS "AgentRun",
    om."Name" AS "OriginalModel",
    rr."RunName" AS "RerunFromPromptRun",
    j."Name" AS "Judge",
    cp."Name" AS "ChildPrompt",
    tr."Test" AS "TestRun",
    root_parent."RootID" AS "RootParentID",
    root_rerun."RootID" AS "RootRerunFromPromptRunID"
FROM
    __mj."AIPromptRun" a
INNER JOIN
    __mj."AIPrompt" p ON a."PromptID" = p."ID"
INNER JOIN
    __mj."AIModel" m ON a."ModelID" = m."ID"
INNER JOIN
    __mj."AIVendor" v ON a."VendorID" = v."ID"
LEFT OUTER JOIN
    __mj."AIAgent" ag ON a."AgentID" = ag."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" cfg ON a."ConfigurationID" = cfg."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" par ON a."ParentID" = par."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" ar ON a."AgentRunID" = ar."ID"
LEFT OUTER JOIN
    __mj."AIModel" om ON a."OriginalModelID" = om."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" rr ON a."RerunFromPromptRunID" = rr."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" j ON a."JudgeID" = j."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" cp ON a."ChildPromptID" = cp."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" tr ON a."TestRunID" = tr."ID"
LEFT JOIN LATERAL
    __mj."fnAIPromptRunParentID_GetRootID"(a."ID", a."ParentID") AS root_parent ON true
LEFT JOIN LATERAL
    __mj."fnAIPromptRunRerunFromPromptRunID_GetRootID"(a."ID", a."RerunFromPromptRunID") AS root_rerun ON true;

-- 20. vwCommunicationLogs
DROP VIEW IF EXISTS __mj."vwCommunicationLogs" CASCADE;
CREATE OR REPLACE VIEW __mj."vwCommunicationLogs" AS
SELECT
    c.*,
    cp."Name" AS "CommunicationProvider",
    cpmt."Name" AS "CommunicationProviderMessageType",
    cr."User" AS "CommunicationRun"
FROM
    __mj."CommunicationLog" c
INNER JOIN
    __mj."CommunicationProvider" cp ON c."CommunicationProviderID" = cp."ID"
INNER JOIN
    __mj."CommunicationProviderMessageType" cpmt ON c."CommunicationProviderMessageTypeID" = cpmt."ID"
LEFT OUTER JOIN
    __mj."vwCommunicationRuns" cr ON c."CommunicationRunID" = cr."ID";

-- 21. vwApplicationEntities (depends on vwEntities)
DROP VIEW IF EXISTS __mj."vwApplicationEntities" CASCADE;
CREATE OR REPLACE VIEW __mj."vwApplicationEntities" AS
SELECT
    ae.*,
    a."Name" AS "Application",
    e."Name" AS "Entity",
    e."BaseTable" AS "EntityBaseTable",
    e."CodeName" AS "EntityCodeName",
    e."ClassName" AS "EntityClassName",
    e."BaseTableCodeName" AS "EntityBaseTableCodeName"
FROM
    __mj."ApplicationEntity" ae
INNER JOIN
    __mj."Application" a ON ae."ApplicationID" = a."ID"
INNER JOIN
    __mj."vwEntities" e ON ae."EntityID" = e."ID";

-- 22. vwUserApplicationEntities (depends on vwUserApplications)
DROP VIEW IF EXISTS __mj."vwUserApplicationEntities" CASCADE;
CREATE OR REPLACE VIEW __mj."vwUserApplicationEntities" AS
SELECT
    uae.*,
    ua."Application",
    ua."User",
    e."Name" AS "Entity"
FROM
    __mj."UserApplicationEntity" uae
INNER JOIN
    __mj."vwUserApplications" ua ON uae."UserApplicationID" = ua."ID"
INNER JOIN
    __mj."Entity" e ON uae."EntityID" = e."ID";

-- 23. vwUserFavorites (depends on vwEntities)
DROP VIEW IF EXISTS __mj."vwUserFavorites" CASCADE;
CREATE OR REPLACE VIEW __mj."vwUserFavorites" AS
SELECT
    uf.*,
    e."Name" AS "Entity",
    e."BaseTable" AS "EntityBaseTable",
    e."BaseView" AS "EntityBaseView"
FROM
    __mj."UserFavorite" uf
INNER JOIN
    __mj."vwEntities" e ON uf."EntityID" = e."ID";

-- 24. vwIntegrationURLFormats
DROP VIEW IF EXISTS __mj."vwIntegrationURLFormats" CASCADE;
CREATE OR REPLACE VIEW __mj."vwIntegrationURLFormats" AS
SELECT
    iuf.*,
    i."Name" AS "Integration",
    i."NavigationBaseURL",
    i."NavigationBaseURL" || iuf."URLFormat" AS "FullURLFormat"
FROM
    __mj."IntegrationURLFormat" iuf
INNER JOIN
    __mj."Integration" i ON iuf."IntegrationID" = i."ID";


-- ============================================================================
-- Recreate stored procedures that were cascade-dropped with the views above.
-- These functions RETURNS SETOF the views and are destroyed by DROP CASCADE.
-- ============================================================================

CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(
    IN p_ID UUID,
    IN p_ConversationID UUID,
    IN p_ExternalID VARCHAR(100),
    IN p_Role VARCHAR(20),
    IN p_Message TEXT,
    IN p_Error TEXT,
    IN p_HiddenToUser BOOLEAN,
    IN p_UserRating INTEGER,
    IN p_UserFeedback TEXT,
    IN p_ReflectionInsights TEXT,
    IN p_SummaryOfEarlierConversation TEXT,
    IN p_UserID UUID,
    IN p_ArtifactID UUID,
    IN p_ArtifactVersionID UUID,
    IN p_CompletionTime BIGINT,
    IN p_IsPinned BOOLEAN,
    IN p_ParentID UUID,
    IN p_AgentID UUID,
    IN p_Status VARCHAR(20),
    IN p_SuggestedResponses TEXT,
    IN p_TestRunID UUID,
    IN p_ResponseForm TEXT,
    IN p_ActionableCommands TEXT,
    IN p_AutomaticCommands TEXT,
    IN p_OriginalMessageChanged BOOLEAN
)
RETURNS SETOF __mj."vwConversationDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationDetail"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(
    IN p_ID UUID,
    IN p_AgentID UUID,
    IN p_ParentRunID UUID,
    IN p_Status VARCHAR(50),
    IN p_StartedAt TIMESTAMPTZ,
    IN p_CompletedAt TIMESTAMPTZ,
    IN p_Success BOOLEAN,
    IN p_ErrorMessage TEXT,
    IN p_ConversationID UUID,
    IN p_UserID UUID,
    IN p_Result TEXT,
    IN p_AgentState TEXT,
    IN p_TotalTokensUsed INTEGER,
    IN p_TotalCost NUMERIC(18,6),
    IN p_TotalPromptTokensUsed INTEGER,
    IN p_TotalCompletionTokensUsed INTEGER,
    IN p_TotalTokensUsedRollup INTEGER,
    IN p_TotalPromptTokensUsedRollup INTEGER,
    IN p_TotalCompletionTokensUsedRollup INTEGER,
    IN p_TotalCostRollup NUMERIC(19,8),
    IN p_ConversationDetailID UUID,
    IN p_ConversationDetailSequence INTEGER,
    IN p_CancellationReason VARCHAR(30),
    IN p_FinalStep VARCHAR(30),
    IN p_FinalPayload TEXT,
    IN p_Message TEXT,
    IN p_LastRunID UUID,
    IN p_StartingPayload TEXT,
    IN p_TotalPromptIterations INTEGER,
    IN p_ConfigurationID UUID,
    IN p_OverrideModelID UUID,
    IN p_OverrideVendorID UUID,
    IN p_Data TEXT,
    IN p_Verbose BOOLEAN,
    IN p_EffortLevel INTEGER,
    IN p_RunName VARCHAR(255),
    IN p_Comments TEXT,
    IN p_ScheduledJobRunID UUID,
    IN p_TestRunID UUID,
    IN p_PrimaryScopeEntityID UUID,
    IN p_PrimaryScopeRecordID VARCHAR(100),
    IN p_SecondaryScopes TEXT
)
RETURNS SETOF __mj."vwAIAgentRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRun"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = p_ID;
    END IF;
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
    IN p_PriorVersionID UUID
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
        "PriorVersionID" = p_PriorVersionID
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

CREATE OR REPLACE FUNCTION __mj."spCreateTestRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TestID UUID DEFAULT NULL,
    IN p_TestSuiteRunID UUID DEFAULT NULL,
    IN p_RunByUserID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_TargetType VARCHAR(100) DEFAULT NULL,
    IN p_TargetLogID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_DurationSeconds NUMERIC(10,3) DEFAULT NULL,
    IN p_InputData TEXT DEFAULT NULL,
    IN p_ExpectedOutputData TEXT DEFAULT NULL,
    IN p_ActualOutputData TEXT DEFAULT NULL,
    IN p_PassedChecks INTEGER DEFAULT NULL,
    IN p_FailedChecks INTEGER DEFAULT NULL,
    IN p_TotalChecks INTEGER DEFAULT NULL,
    IN p_Score NUMERIC(5,4) DEFAULT NULL,
    IN p_CostUSD NUMERIC(10,6) DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ResultDetails TEXT DEFAULT NULL,
    IN p_Log TEXT DEFAULT NULL,
    IN p_Tags TEXT DEFAULT NULL,
    IN p_MachineName VARCHAR(255) DEFAULT NULL,
    IN p_MachineID VARCHAR(255) DEFAULT NULL,
    IN p_RunByUserName VARCHAR(255) DEFAULT NULL,
    IN p_RunByUserEmail VARCHAR(255) DEFAULT NULL,
    IN p_RunContextDetails TEXT DEFAULT NULL,
    IN p_TargetLogEntityID UUID DEFAULT NULL,
    IN p_ResolvedVariables TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwTestRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TestRun"
            (
                "ID",
                "TestID",
                "TestSuiteRunID",
                "RunByUserID",
                "Sequence",
                "TargetType",
                "TargetLogID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "DurationSeconds",
                "InputData",
                "ExpectedOutputData",
                "ActualOutputData",
                "PassedChecks",
                "FailedChecks",
                "TotalChecks",
                "Score",
                "CostUSD",
                "ErrorMessage",
                "ResultDetails",
                "Log",
                "Tags",
                "MachineName",
                "MachineID",
                "RunByUserName",
                "RunByUserEmail",
                "RunContextDetails",
                "TargetLogEntityID",
                "ResolvedVariables"
            )
        VALUES
            (
                p_ID,
                p_TestID,
                p_TestSuiteRunID,
                p_RunByUserID,
                p_Sequence,
                p_TargetType,
                p_TargetLogID,
                COALESCE(p_Status, 'Pending'),
                p_StartedAt,
                p_CompletedAt,
                p_DurationSeconds,
                p_InputData,
                p_ExpectedOutputData,
                p_ActualOutputData,
                p_PassedChecks,
                p_FailedChecks,
                p_TotalChecks,
                p_Score,
                p_CostUSD,
                p_ErrorMessage,
                p_ResultDetails,
                p_Log,
                p_Tags,
                p_MachineName,
                p_MachineID,
                p_RunByUserName,
                p_RunByUserEmail,
                p_RunContextDetails,
                p_TargetLogEntityID,
                p_ResolvedVariables
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TestRun"
            (
                "TestID",
                "TestSuiteRunID",
                "RunByUserID",
                "Sequence",
                "TargetType",
                "TargetLogID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "DurationSeconds",
                "InputData",
                "ExpectedOutputData",
                "ActualOutputData",
                "PassedChecks",
                "FailedChecks",
                "TotalChecks",
                "Score",
                "CostUSD",
                "ErrorMessage",
                "ResultDetails",
                "Log",
                "Tags",
                "MachineName",
                "MachineID",
                "RunByUserName",
                "RunByUserEmail",
                "RunContextDetails",
                "TargetLogEntityID",
                "ResolvedVariables"
            )
        VALUES
            (
                p_TestID,
                p_TestSuiteRunID,
                p_RunByUserID,
                p_Sequence,
                p_TargetType,
                p_TargetLogID,
                COALESCE(p_Status, 'Pending'),
                p_StartedAt,
                p_CompletedAt,
                p_DurationSeconds,
                p_InputData,
                p_ExpectedOutputData,
                p_ActualOutputData,
                p_PassedChecks,
                p_FailedChecks,
                p_TotalChecks,
                p_Score,
                p_CostUSD,
                p_ErrorMessage,
                p_ResultDetails,
                p_Log,
                p_Tags,
                p_MachineName,
                p_MachineID,
                p_RunByUserName,
                p_RunByUserEmail,
                p_RunContextDetails,
                p_TargetLogEntityID,
                p_ResolvedVariables
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTestRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateDuplicateRunDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DuplicateRunID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(500) DEFAULT NULL,
    IN p_MatchStatus VARCHAR(20) DEFAULT NULL,
    IN p_SkippedReason TEXT DEFAULT NULL,
    IN p_MatchErrorMessage TEXT DEFAULT NULL,
    IN p_MergeStatus VARCHAR(20) DEFAULT NULL,
    IN p_MergeErrorMessage TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."DuplicateRunDetail"
            (
                "ID",
                "DuplicateRunID",
                "RecordID",
                "MatchStatus",
                "SkippedReason",
                "MatchErrorMessage",
                "MergeStatus",
                "MergeErrorMessage"
            )
        VALUES
            (
                p_ID,
                p_DuplicateRunID,
                p_RecordID,
                COALESCE(p_MatchStatus, 'Pending'),
                p_SkippedReason,
                p_MatchErrorMessage,
                COALESCE(p_MergeStatus, 'Not Applicable'),
                p_MergeErrorMessage
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."DuplicateRunDetail"
            (
                "DuplicateRunID",
                "RecordID",
                "MatchStatus",
                "SkippedReason",
                "MatchErrorMessage",
                "MergeStatus",
                "MergeErrorMessage"
            )
        VALUES
            (
                p_DuplicateRunID,
                p_RecordID,
                COALESCE(p_MatchStatus, 'Pending'),
                p_SkippedReason,
                p_MatchErrorMessage,
                COALESCE(p_MergeStatus, 'Not Applicable'),
                p_MergeErrorMessage
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionFilter"(
    IN p_ID UUID,
    IN p_EntityActionID UUID,
    IN p_ActionFilterID UUID,
    IN p_Sequence INTEGER,
    IN p_Status VARCHAR(20)
)
RETURNS SETOF __mj."vwEntityActionFilters" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityActionFilter"
    SET
        "EntityActionID" = p_EntityActionID,
        "ActionFilterID" = p_ActionFilterID,
        "Sequence" = p_Sequence,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestRun"(
    IN p_ID UUID,
    IN p_TestID UUID,
    IN p_TestSuiteRunID UUID,
    IN p_RunByUserID UUID,
    IN p_Sequence INTEGER,
    IN p_TargetType VARCHAR(100),
    IN p_TargetLogID UUID,
    IN p_Status VARCHAR(20),
    IN p_StartedAt TIMESTAMPTZ,
    IN p_CompletedAt TIMESTAMPTZ,
    IN p_DurationSeconds NUMERIC(10,3),
    IN p_InputData TEXT,
    IN p_ExpectedOutputData TEXT,
    IN p_ActualOutputData TEXT,
    IN p_PassedChecks INTEGER,
    IN p_FailedChecks INTEGER,
    IN p_TotalChecks INTEGER,
    IN p_Score NUMERIC(5,4),
    IN p_CostUSD NUMERIC(10,6),
    IN p_ErrorMessage TEXT,
    IN p_ResultDetails TEXT,
    IN p_Log TEXT,
    IN p_Tags TEXT,
    IN p_MachineName VARCHAR(255),
    IN p_MachineID VARCHAR(255),
    IN p_RunByUserName VARCHAR(255),
    IN p_RunByUserEmail VARCHAR(255),
    IN p_RunContextDetails TEXT,
    IN p_TargetLogEntityID UUID,
    IN p_ResolvedVariables TEXT
)
RETURNS SETOF __mj."vwTestRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TestRun"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTestRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTestRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityRelationship"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_BundleInAPI BOOLEAN DEFAULT NULL,
    IN p_IncludeInParentAllQuery BOOLEAN DEFAULT NULL,
    IN p_Type CHAR(20) DEFAULT NULL,
    IN p_EntityKeyField VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityJoinField VARCHAR(255) DEFAULT NULL,
    IN p_JoinView VARCHAR(255) DEFAULT NULL,
    IN p_JoinEntityJoinField VARCHAR(255) DEFAULT NULL,
    IN p_JoinEntityInverseJoinField VARCHAR(255) DEFAULT NULL,
    IN p_DisplayInForm BOOLEAN DEFAULT NULL,
    IN p_DisplayLocation VARCHAR(50) DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_DisplayIconType VARCHAR(50) DEFAULT NULL,
    IN p_DisplayIcon VARCHAR(255) DEFAULT NULL,
    IN p_DisplayComponentID UUID DEFAULT NULL,
    IN p_DisplayComponentConfiguration TEXT DEFAULT NULL,
    IN p_AutoUpdateFromSchema BOOLEAN DEFAULT NULL,
    IN p_AdditionalFieldsToInclude TEXT DEFAULT NULL,
    IN p_AutoUpdateAdditionalFieldsToInclude BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityRelationships" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityRelationship"
            (
                "ID",
                "EntityID",
                "Sequence",
                "RelatedEntityID",
                "BundleInAPI",
                "IncludeInParentAllQuery",
                "Type",
                "EntityKeyField",
                "RelatedEntityJoinField",
                "JoinView",
                "JoinEntityJoinField",
                "JoinEntityInverseJoinField",
                "DisplayInForm",
                "DisplayLocation",
                "DisplayName",
                "DisplayIconType",
                "DisplayIcon",
                "DisplayComponentID",
                "DisplayComponentConfiguration",
                "AutoUpdateFromSchema",
                "AdditionalFieldsToInclude",
                "AutoUpdateAdditionalFieldsToInclude"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                COALESCE(p_Sequence, 0),
                p_RelatedEntityID,
                COALESCE(p_BundleInAPI, TRUE),
                COALESCE(p_IncludeInParentAllQuery, FALSE),
                COALESCE(p_Type, 'One To Many'),
                p_EntityKeyField,
                p_RelatedEntityJoinField,
                p_JoinView,
                p_JoinEntityJoinField,
                p_JoinEntityInverseJoinField,
                COALESCE(p_DisplayInForm, TRUE),
                COALESCE(p_DisplayLocation, 'After Field Tabs'),
                p_DisplayName,
                COALESCE(p_DisplayIconType, 'Related Entity Icon'),
                p_DisplayIcon,
                p_DisplayComponentID,
                p_DisplayComponentConfiguration,
                COALESCE(p_AutoUpdateFromSchema, TRUE),
                p_AdditionalFieldsToInclude,
                COALESCE(p_AutoUpdateAdditionalFieldsToInclude, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityRelationship"
            (
                "EntityID",
                "Sequence",
                "RelatedEntityID",
                "BundleInAPI",
                "IncludeInParentAllQuery",
                "Type",
                "EntityKeyField",
                "RelatedEntityJoinField",
                "JoinView",
                "JoinEntityJoinField",
                "JoinEntityInverseJoinField",
                "DisplayInForm",
                "DisplayLocation",
                "DisplayName",
                "DisplayIconType",
                "DisplayIcon",
                "DisplayComponentID",
                "DisplayComponentConfiguration",
                "AutoUpdateFromSchema",
                "AdditionalFieldsToInclude",
                "AutoUpdateAdditionalFieldsToInclude"
            )
        VALUES
            (
                p_EntityID,
                COALESCE(p_Sequence, 0),
                p_RelatedEntityID,
                COALESCE(p_BundleInAPI, TRUE),
                COALESCE(p_IncludeInParentAllQuery, FALSE),
                COALESCE(p_Type, 'One To Many'),
                p_EntityKeyField,
                p_RelatedEntityJoinField,
                p_JoinView,
                p_JoinEntityJoinField,
                p_JoinEntityInverseJoinField,
                COALESCE(p_DisplayInForm, TRUE),
                COALESCE(p_DisplayLocation, 'After Field Tabs'),
                p_DisplayName,
                COALESCE(p_DisplayIconType, 'Related Entity Icon'),
                p_DisplayIcon,
                p_DisplayComponentID,
                p_DisplayComponentConfiguration,
                COALESCE(p_AutoUpdateFromSchema, TRUE),
                p_AdditionalFieldsToInclude,
                COALESCE(p_AutoUpdateAdditionalFieldsToInclude, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionParam"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_ActionParamID UUID DEFAULT NULL,
    IN p_ValueType VARCHAR(20) DEFAULT NULL,
    IN p_Value TEXT DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionParams" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityActionParam"
            (
                "ID",
                "EntityActionID",
                "ActionParamID",
                "ValueType",
                "Value",
                "Comments"
            )
        VALUES
            (
                p_ID,
                p_EntityActionID,
                p_ActionParamID,
                p_ValueType,
                p_Value,
                p_Comments
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityActionParam"
            (
                "EntityActionID",
                "ActionParamID",
                "ValueType",
                "Value",
                "Comments"
            )
        VALUES
            (
                p_EntityActionID,
                p_ActionParamID,
                p_ValueType,
                p_Value,
                p_Comments
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserApplicationEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserApplicationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwUserApplicationEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."UserApplicationEntity"
            (
                "ID",
                "UserApplicationID",
                "EntityID",
                "Sequence"
            )
        VALUES
            (
                p_ID,
                p_UserApplicationID,
                p_EntityID,
                COALESCE(p_Sequence, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."UserApplicationEntity"
            (
                "UserApplicationID",
                "EntityID",
                "Sequence"
            )
        VALUES
            (
                p_UserApplicationID,
                p_EntityID,
                COALESCE(p_Sequence, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwUserApplicationEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityCommunicationField"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityCommunicationMessageTypeID UUID DEFAULT NULL,
    IN p_FieldName VARCHAR(500) DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityCommunicationFields" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityCommunicationField"
            (
                "ID",
                "EntityCommunicationMessageTypeID",
                "FieldName",
                "Priority"
            )
        VALUES
            (
                p_ID,
                p_EntityCommunicationMessageTypeID,
                p_FieldName,
                p_Priority
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityCommunicationField"
            (
                "EntityCommunicationMessageTypeID",
                "FieldName",
                "Priority"
            )
        VALUES
            (
                p_EntityCommunicationMessageTypeID,
                p_FieldName,
                p_Priority
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityCommunicationFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversation"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ExternalID VARCHAR(500) DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Type VARCHAR(50) DEFAULT NULL,
    IN p_IsArchived BOOLEAN DEFAULT NULL,
    IN p_LinkedEntityID UUID DEFAULT NULL,
    IN p_LinkedRecordID VARCHAR(500) DEFAULT NULL,
    IN p_DataContextID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_ProjectID UUID DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_TestRunID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Conversation"
            (
                "ID",
                "UserID",
                "ExternalID",
                "Name",
                "Description",
                "Type",
                "IsArchived",
                "LinkedEntityID",
                "LinkedRecordID",
                "DataContextID",
                "Status",
                "EnvironmentID",
                "ProjectID",
                "IsPinned",
                "TestRunID"
            )
        VALUES
            (
                p_ID,
                p_UserID,
                p_ExternalID,
                p_Name,
                p_Description,
                COALESCE(p_Type, 'Skip'),
                COALESCE(p_IsArchived, FALSE),
                p_LinkedEntityID,
                p_LinkedRecordID,
                p_DataContextID,
                COALESCE(p_Status, 'Available'),
                CASE p_EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                p_ProjectID,
                COALESCE(p_IsPinned, FALSE),
                p_TestRunID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Conversation"
            (
                "UserID",
                "ExternalID",
                "Name",
                "Description",
                "Type",
                "IsArchived",
                "LinkedEntityID",
                "LinkedRecordID",
                "DataContextID",
                "Status",
                "EnvironmentID",
                "ProjectID",
                "IsPinned",
                "TestRunID"
            )
        VALUES
            (
                p_UserID,
                p_ExternalID,
                p_Name,
                p_Description,
                COALESCE(p_Type, 'Skip'),
                COALESCE(p_IsArchived, FALSE),
                p_LinkedEntityID,
                p_LinkedRecordID,
                p_DataContextID,
                COALESCE(p_Status, 'Available'),
                CASE p_EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                p_ProjectID,
                COALESCE(p_IsPinned, FALSE),
                p_TestRunID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_ParentRunID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Result TEXT DEFAULT NULL,
    IN p_AgentState TEXT DEFAULT NULL,
    IN p_TotalTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCost NUMERIC(18,6) DEFAULT NULL,
    IN p_TotalPromptTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalPromptTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCostRollup NUMERIC(19,8) DEFAULT NULL,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ConversationDetailSequence INTEGER DEFAULT NULL,
    IN p_CancellationReason VARCHAR(30) DEFAULT NULL,
    IN p_FinalStep VARCHAR(30) DEFAULT NULL,
    IN p_FinalPayload TEXT DEFAULT NULL,
    IN p_Message TEXT DEFAULT NULL,
    IN p_LastRunID UUID DEFAULT NULL,
    IN p_StartingPayload TEXT DEFAULT NULL,
    IN p_TotalPromptIterations INTEGER DEFAULT NULL,
    IN p_ConfigurationID UUID DEFAULT NULL,
    IN p_OverrideModelID UUID DEFAULT NULL,
    IN p_OverrideVendorID UUID DEFAULT NULL,
    IN p_Data TEXT DEFAULT NULL,
    IN p_Verbose BOOLEAN DEFAULT NULL,
    IN p_EffortLevel INTEGER DEFAULT NULL,
    IN p_RunName VARCHAR(255) DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ScheduledJobRunID UUID DEFAULT NULL,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentRun"
            (
                "ID",
                "AgentID",
                "ParentRunID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "ConversationID",
                "UserID",
                "Result",
                "AgentState",
                "TotalTokensUsed",
                "TotalCost",
                "TotalPromptTokensUsed",
                "TotalCompletionTokensUsed",
                "TotalTokensUsedRollup",
                "TotalPromptTokensUsedRollup",
                "TotalCompletionTokensUsedRollup",
                "TotalCostRollup",
                "ConversationDetailID",
                "ConversationDetailSequence",
                "CancellationReason",
                "FinalStep",
                "FinalPayload",
                "Message",
                "LastRunID",
                "StartingPayload",
                "TotalPromptIterations",
                "ConfigurationID",
                "OverrideModelID",
                "OverrideVendorID",
                "Data",
                "Verbose",
                "EffortLevel",
                "RunName",
                "Comments",
                "ScheduledJobRunID",
                "TestRunID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                p_ParentRunID,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                p_CompletedAt,
                p_Success,
                p_ErrorMessage,
                p_ConversationID,
                p_UserID,
                p_Result,
                p_AgentState,
                p_TotalTokensUsed,
                p_TotalCost,
                p_TotalPromptTokensUsed,
                p_TotalCompletionTokensUsed,
                p_TotalTokensUsedRollup,
                p_TotalPromptTokensUsedRollup,
                p_TotalCompletionTokensUsedRollup,
                p_TotalCostRollup,
                p_ConversationDetailID,
                p_ConversationDetailSequence,
                p_CancellationReason,
                p_FinalStep,
                p_FinalPayload,
                p_Message,
                p_LastRunID,
                p_StartingPayload,
                COALESCE(p_TotalPromptIterations, 0),
                p_ConfigurationID,
                p_OverrideModelID,
                p_OverrideVendorID,
                p_Data,
                p_Verbose,
                p_EffortLevel,
                p_RunName,
                p_Comments,
                p_ScheduledJobRunID,
                p_TestRunID,
                p_PrimaryScopeEntityID,
                p_PrimaryScopeRecordID,
                p_SecondaryScopes
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentRun"
            (
                "AgentID",
                "ParentRunID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "ConversationID",
                "UserID",
                "Result",
                "AgentState",
                "TotalTokensUsed",
                "TotalCost",
                "TotalPromptTokensUsed",
                "TotalCompletionTokensUsed",
                "TotalTokensUsedRollup",
                "TotalPromptTokensUsedRollup",
                "TotalCompletionTokensUsedRollup",
                "TotalCostRollup",
                "ConversationDetailID",
                "ConversationDetailSequence",
                "CancellationReason",
                "FinalStep",
                "FinalPayload",
                "Message",
                "LastRunID",
                "StartingPayload",
                "TotalPromptIterations",
                "ConfigurationID",
                "OverrideModelID",
                "OverrideVendorID",
                "Data",
                "Verbose",
                "EffortLevel",
                "RunName",
                "Comments",
                "ScheduledJobRunID",
                "TestRunID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes"
            )
        VALUES
            (
                p_AgentID,
                p_ParentRunID,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                p_CompletedAt,
                p_Success,
                p_ErrorMessage,
                p_ConversationID,
                p_UserID,
                p_Result,
                p_AgentState,
                p_TotalTokensUsed,
                p_TotalCost,
                p_TotalPromptTokensUsed,
                p_TotalCompletionTokensUsed,
                p_TotalTokensUsedRollup,
                p_TotalPromptTokensUsedRollup,
                p_TotalCompletionTokensUsedRollup,
                p_TotalCostRollup,
                p_ConversationDetailID,
                p_ConversationDetailSequence,
                p_CancellationReason,
                p_FinalStep,
                p_FinalPayload,
                p_Message,
                p_LastRunID,
                p_StartingPayload,
                COALESCE(p_TotalPromptIterations, 0),
                p_ConfigurationID,
                p_OverrideModelID,
                p_OverrideVendorID,
                p_Data,
                p_Verbose,
                p_EffortLevel,
                p_RunName,
                p_Comments,
                p_ScheduledJobRunID,
                p_TestRunID,
                p_PrimaryScopeEntityID,
                p_PrimaryScopeRecordID,
                p_SecondaryScopes
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateConversation"(
    IN p_ID UUID,
    IN p_UserID UUID,
    IN p_ExternalID VARCHAR(500),
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_Type VARCHAR(50),
    IN p_IsArchived BOOLEAN,
    IN p_LinkedEntityID UUID,
    IN p_LinkedRecordID VARCHAR(500),
    IN p_DataContextID UUID,
    IN p_Status VARCHAR(20),
    IN p_EnvironmentID UUID,
    IN p_ProjectID UUID,
    IN p_IsPinned BOOLEAN,
    IN p_TestRunID UUID
)
RETURNS SETOF __mj."vwConversations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Conversation"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCommunicationLog"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CommunicationProviderID UUID DEFAULT NULL,
    IN p_CommunicationProviderMessageTypeID UUID DEFAULT NULL,
    IN p_CommunicationRunID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(20) DEFAULT NULL,
    IN p_MessageDate TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_MessageContent TEXT DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwCommunicationLogs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CommunicationLog"
            (
                "ID",
                "CommunicationProviderID",
                "CommunicationProviderMessageTypeID",
                "CommunicationRunID",
                "Direction",
                "MessageDate",
                "Status",
                "MessageContent",
                "ErrorMessage"
            )
        VALUES
            (
                p_ID,
                p_CommunicationProviderID,
                p_CommunicationProviderMessageTypeID,
                p_CommunicationRunID,
                p_Direction,
                p_MessageDate,
                COALESCE(p_Status, 'Pending'),
                p_MessageContent,
                p_ErrorMessage
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CommunicationLog"
            (
                "CommunicationProviderID",
                "CommunicationProviderMessageTypeID",
                "CommunicationRunID",
                "Direction",
                "MessageDate",
                "Status",
                "MessageContent",
                "ErrorMessage"
            )
        VALUES
            (
                p_CommunicationProviderID,
                p_CommunicationProviderMessageTypeID,
                p_CommunicationRunID,
                p_Direction,
                p_MessageDate,
                COALESCE(p_Status, 'Pending'),
                p_MessageContent,
                p_ErrorMessage
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCommunicationLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationURLFormat"(
    IN p_ID UUID,
    IN p_IntegrationID UUID,
    IN p_EntityID UUID,
    IN p_URLFormat VARCHAR(500),
    IN p_Comments TEXT
)
RETURNS SETOF __mj."vwIntegrationURLFormats" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IntegrationURLFormat"
    SET
        "IntegrationID" = p_IntegrationID,
        "EntityID" = p_EntityID,
        "URLFormat" = p_URLFormat,
        "Comments" = p_Comments
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrationURLFormats" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrationURLFormats" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordChange_Internal"(
    IN p_EntityName VARCHAR(100),
    IN p_RecordID VARCHAR(750),
    IN p_UserID UUID,
    IN p_Type VARCHAR(20),
    IN p_ChangesJSON TEXT,
    IN p_ChangesDescription TEXT,
    IN p_FullRecordJSON TEXT,
    IN p_Status CHAR(15),
    IN p_Comments TEXT
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
BEGIN
INSERT INTO
    __mj."RecordChange"
        (
            EntityID,
            RecordID,
			      UserID,
            Type,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments
        )
    VALUES
        (
            (SELECT ID FROM __mj."Entity" WHERE Name = p_EntityName),
            p_RecordID,
			      p_UserID,
            p_Type,
            NOW(),
            p_ChangesJSON,
            p_ChangesDescription,
            p_FullRecordJSON,
            p_Status,
            p_Comments
        );
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM "__mj".vwRecordChanges WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordChange"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(750),
    IN p_UserID UUID,
    IN p_Type VARCHAR(20),
    IN p_Source VARCHAR(20),
    IN p_ChangedAt TIMESTAMPTZ,
    IN p_ChangesJSON TEXT,
    IN p_ChangesDescription TEXT,
    IN p_FullRecordJSON TEXT,
    IN p_Status VARCHAR(50),
    IN p_ErrorLog TEXT,
    IN p_ReplayRunID UUID,
    IN p_IntegrationID UUID,
    IN p_Comments TEXT
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."RecordChange"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionInvocation"(
    IN p_ID UUID,
    IN p_EntityActionID UUID,
    IN p_InvocationTypeID UUID,
    IN p_Status VARCHAR(20)
)
RETURNS SETOF __mj."vwEntityActionInvocations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityActionInvocation"
    SET
        "EntityActionID" = p_EntityActionID,
        "InvocationTypeID" = p_InvocationTypeID,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAICredentialBinding"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CredentialID UUID DEFAULT NULL,
    IN p_BindingType VARCHAR(20) DEFAULT NULL,
    IN p_AIVendorID UUID DEFAULT NULL,
    IN p_AIModelVendorID UUID DEFAULT NULL,
    IN p_AIPromptModelID UUID DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwAICredentialBindings" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AICredentialBinding"
            (
                "ID",
                "CredentialID",
                "BindingType",
                "AIVendorID",
                "AIModelVendorID",
                "AIPromptModelID",
                "Priority",
                "IsActive"
            )
        VALUES
            (
                p_ID,
                p_CredentialID,
                p_BindingType,
                p_AIVendorID,
                p_AIModelVendorID,
                p_AIPromptModelID,
                COALESCE(p_Priority, 0),
                COALESCE(p_IsActive, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AICredentialBinding"
            (
                "CredentialID",
                "BindingType",
                "AIVendorID",
                "AIModelVendorID",
                "AIPromptModelID",
                "Priority",
                "IsActive"
            )
        VALUES
            (
                p_CredentialID,
                p_BindingType,
                p_AIVendorID,
                p_AIModelVendorID,
                p_AIPromptModelID,
                COALESCE(p_Priority, 0),
                COALESCE(p_IsActive, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAICredentialBindings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionParam"(
    IN p_ID UUID,
    IN p_EntityActionID UUID,
    IN p_ActionParamID UUID,
    IN p_ValueType VARCHAR(20),
    IN p_Value TEXT,
    IN p_Comments TEXT
)
RETURNS SETOF __mj."vwEntityActionParams" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityActionParam"
    SET
        "EntityActionID" = p_EntityActionID,
        "ActionParamID" = p_ActionParamID,
        "ValueType" = p_ValueType,
        "Value" = p_Value,
        "Comments" = p_Comments
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(
    IN p_ID UUID,
    IN p_PromptID UUID,
    IN p_ModelID UUID,
    IN p_VendorID UUID,
    IN p_AgentID UUID,
    IN p_ConfigurationID UUID,
    IN p_RunAt TIMESTAMPTZ,
    IN p_CompletedAt TIMESTAMPTZ,
    IN p_ExecutionTimeMS INTEGER,
    IN p_Messages TEXT,
    IN p_Result TEXT,
    IN p_TokensUsed INTEGER,
    IN p_TokensPrompt INTEGER,
    IN p_TokensCompletion INTEGER,
    IN p_TotalCost NUMERIC(18,6),
    IN p_Success BOOLEAN,
    IN p_ErrorMessage TEXT,
    IN p_ParentID UUID,
    IN p_RunType VARCHAR(20),
    IN p_ExecutionOrder INTEGER,
    IN p_AgentRunID UUID,
    IN p_Cost NUMERIC(19,8),
    IN p_CostCurrency VARCHAR(10),
    IN p_TokensUsedRollup INTEGER,
    IN p_TokensPromptRollup INTEGER,
    IN p_TokensCompletionRollup INTEGER,
    IN p_Temperature NUMERIC(3,2),
    IN p_TopP NUMERIC(3,2),
    IN p_TopK INTEGER,
    IN p_MinP NUMERIC(3,2),
    IN p_FrequencyPenalty NUMERIC(3,2),
    IN p_PresencePenalty NUMERIC(3,2),
    IN p_Seed INTEGER,
    IN p_StopSequences TEXT,
    IN p_ResponseFormat VARCHAR(50),
    IN p_LogProbs BOOLEAN,
    IN p_TopLogProbs INTEGER,
    IN p_DescendantCost NUMERIC(18,6),
    IN p_ValidationAttemptCount INTEGER,
    IN p_SuccessfulValidationCount INTEGER,
    IN p_FinalValidationPassed BOOLEAN,
    IN p_ValidationBehavior VARCHAR(50),
    IN p_RetryStrategy VARCHAR(50),
    IN p_MaxRetriesConfigured INTEGER,
    IN p_FinalValidationError VARCHAR(500),
    IN p_ValidationErrorCount INTEGER,
    IN p_CommonValidationError VARCHAR(255),
    IN p_FirstAttemptAt TIMESTAMPTZ,
    IN p_LastAttemptAt TIMESTAMPTZ,
    IN p_TotalRetryDurationMS INTEGER,
    IN p_ValidationAttempts TEXT,
    IN p_ValidationSummary TEXT,
    IN p_FailoverAttempts INTEGER,
    IN p_FailoverErrors TEXT,
    IN p_FailoverDurations TEXT,
    IN p_OriginalModelID UUID,
    IN p_OriginalRequestStartTime TIMESTAMPTZ,
    IN p_TotalFailoverDuration INTEGER,
    IN p_RerunFromPromptRunID UUID,
    IN p_ModelSelection TEXT,
    IN p_Status VARCHAR(50),
    IN p_Cancelled BOOLEAN,
    IN p_CancellationReason TEXT,
    IN p_ModelPowerRank INTEGER,
    IN p_SelectionStrategy VARCHAR(50),
    IN p_CacheHit BOOLEAN,
    IN p_CacheKey VARCHAR(500),
    IN p_JudgeID UUID,
    IN p_JudgeScore DOUBLE PRECISION,
    IN p_WasSelectedResult BOOLEAN,
    IN p_StreamingEnabled BOOLEAN,
    IN p_FirstTokenTime INTEGER,
    IN p_ErrorDetails TEXT,
    IN p_ChildPromptID UUID,
    IN p_QueueTime INTEGER,
    IN p_PromptTime INTEGER,
    IN p_CompletionTime INTEGER,
    IN p_ModelSpecificResponseDetails TEXT,
    IN p_EffortLevel INTEGER,
    IN p_RunName VARCHAR(255),
    IN p_Comments TEXT,
    IN p_TestRunID UUID
)
RETURNS SETOF __mj."vwAIPromptRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIPromptRun"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserFavorite"(
    IN p_ID UUID,
    IN p_UserID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(450)
)
RETURNS SETOF __mj."vwUserFavorites" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."UserFavorite"
    SET
        "UserID" = p_UserID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwUserFavorites" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwUserFavorites" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateApplicationEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ApplicationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_DefaultForNewUser BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwApplicationEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ApplicationEntity"
            (
                "ID",
                "ApplicationID",
                "EntityID",
                "Sequence",
                "DefaultForNewUser"
            )
        VALUES
            (
                p_ID,
                p_ApplicationID,
                p_EntityID,
                p_Sequence,
                COALESCE(p_DefaultForNewUser, TRUE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ApplicationEntity"
            (
                "ApplicationID",
                "EntityID",
                "Sequence",
                "DefaultForNewUser"
            )
        VALUES
            (
                p_ApplicationID,
                p_EntityID,
                p_Sequence,
                COALESCE(p_DefaultForNewUser, TRUE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityField"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUnique BOOLEAN DEFAULT NULL,
    IN p_Category VARCHAR(255) DEFAULT NULL,
    IN p_ValueListType VARCHAR(20) DEFAULT NULL,
    IN p_ExtendedType VARCHAR(50) DEFAULT NULL,
    IN p_CodeType VARCHAR(50) DEFAULT NULL,
    IN p_DefaultInView BOOLEAN DEFAULT NULL,
    IN p_ViewCellTemplate TEXT DEFAULT NULL,
    IN p_DefaultColumnWidth INTEGER DEFAULT NULL,
    IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUpdateInView BOOLEAN DEFAULT NULL,
    IN p_IncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL,
    IN p_UserSearchParamFormatAPI VARCHAR(500) DEFAULT NULL,
    IN p_IncludeInGeneratedForm BOOLEAN DEFAULT NULL,
    IN p_GeneratedFormSection VARCHAR(10) DEFAULT NULL,
    IN p_IsNameField BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_RelatedEntityFieldName VARCHAR(255) DEFAULT NULL,
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityNameFieldMap VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityDisplayType VARCHAR(20) DEFAULT NULL,
    IN p_EntityIDFieldName VARCHAR(100) DEFAULT NULL,
    IN p_ScopeDefault VARCHAR(100) DEFAULT NULL,
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN DEFAULT NULL,
    IN p_ValuesToPackWithSchema VARCHAR(10) DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_AutoUpdateIsNameField BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDefaultInView BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateCategory BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDisplayName BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_Encrypt BOOLEAN DEFAULT NULL,
    IN p_EncryptionKeyID UUID DEFAULT NULL,
    IN p_AllowDecryptInAPI BOOLEAN DEFAULT NULL,
    IN p_SendEncryptedValue BOOLEAN DEFAULT NULL,
    IN p_IsSoftPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsSoftForeignKey BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityJoinFields TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityField"
            (
                "ID",
                "DisplayName",
                "Description",
                "AutoUpdateDescription",
                "IsPrimaryKey",
                "IsUnique",
                "Category",
                "ValueListType",
                "ExtendedType",
                "CodeType",
                "DefaultInView",
                "ViewCellTemplate",
                "DefaultColumnWidth",
                "AllowUpdateAPI",
                "AllowUpdateInView",
                "IncludeInUserSearchAPI",
                "FullTextSearchEnabled",
                "UserSearchParamFormatAPI",
                "IncludeInGeneratedForm",
                "GeneratedFormSection",
                "IsNameField",
                "RelatedEntityID",
                "RelatedEntityFieldName",
                "IncludeRelatedEntityNameFieldInBaseView",
                "RelatedEntityNameFieldMap",
                "RelatedEntityDisplayType",
                "EntityIDFieldName",
                "ScopeDefault",
                "AutoUpdateRelatedEntityInfo",
                "ValuesToPackWithSchema",
                "Status",
                "AutoUpdateIsNameField",
                "AutoUpdateDefaultInView",
                "AutoUpdateCategory",
                "AutoUpdateDisplayName",
                "AutoUpdateIncludeInUserSearchAPI",
                "Encrypt",
                "EncryptionKeyID",
                "AllowDecryptInAPI",
                "SendEncryptedValue",
                "IsSoftPrimaryKey",
                "IsSoftForeignKey",
                "RelatedEntityJoinFields"
            )
        VALUES
            (
                p_ID,
                p_DisplayName,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                p_Category,
                COALESCE(p_ValueListType, 'None'),
                p_ExtendedType,
                p_CodeType,
                COALESCE(p_DefaultInView, FALSE),
                p_ViewCellTemplate,
                p_DefaultColumnWidth,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_UserSearchParamFormatAPI,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                p_RelatedEntityID,
                p_RelatedEntityFieldName,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                p_RelatedEntityNameFieldMap,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                p_EntityIDFieldName,
                p_ScopeDefault,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                p_EncryptionKeyID,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                p_RelatedEntityJoinFields
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityField"
            (
                "DisplayName",
                "Description",
                "AutoUpdateDescription",
                "IsPrimaryKey",
                "IsUnique",
                "Category",
                "ValueListType",
                "ExtendedType",
                "CodeType",
                "DefaultInView",
                "ViewCellTemplate",
                "DefaultColumnWidth",
                "AllowUpdateAPI",
                "AllowUpdateInView",
                "IncludeInUserSearchAPI",
                "FullTextSearchEnabled",
                "UserSearchParamFormatAPI",
                "IncludeInGeneratedForm",
                "GeneratedFormSection",
                "IsNameField",
                "RelatedEntityID",
                "RelatedEntityFieldName",
                "IncludeRelatedEntityNameFieldInBaseView",
                "RelatedEntityNameFieldMap",
                "RelatedEntityDisplayType",
                "EntityIDFieldName",
                "ScopeDefault",
                "AutoUpdateRelatedEntityInfo",
                "ValuesToPackWithSchema",
                "Status",
                "AutoUpdateIsNameField",
                "AutoUpdateDefaultInView",
                "AutoUpdateCategory",
                "AutoUpdateDisplayName",
                "AutoUpdateIncludeInUserSearchAPI",
                "Encrypt",
                "EncryptionKeyID",
                "AllowDecryptInAPI",
                "SendEncryptedValue",
                "IsSoftPrimaryKey",
                "IsSoftForeignKey",
                "RelatedEntityJoinFields"
            )
        VALUES
            (
                p_DisplayName,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                p_Category,
                COALESCE(p_ValueListType, 'None'),
                p_ExtendedType,
                p_CodeType,
                COALESCE(p_DefaultInView, FALSE),
                p_ViewCellTemplate,
                p_DefaultColumnWidth,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_UserSearchParamFormatAPI,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                p_RelatedEntityID,
                p_RelatedEntityFieldName,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                p_RelatedEntityNameFieldMap,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                p_EntityIDFieldName,
                p_ScopeDefault,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                p_EncryptionKeyID,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                p_RelatedEntityJoinFields
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityField"(
    IN p_ID UUID,
    IN p_DisplayName VARCHAR(255),
    IN p_Description TEXT,
    IN p_AutoUpdateDescription BOOLEAN,
    IN p_IsPrimaryKey BOOLEAN,
    IN p_IsUnique BOOLEAN,
    IN p_Category VARCHAR(255),
    IN p_ValueListType VARCHAR(20),
    IN p_ExtendedType VARCHAR(50),
    IN p_CodeType VARCHAR(50),
    IN p_DefaultInView BOOLEAN,
    IN p_ViewCellTemplate TEXT,
    IN p_DefaultColumnWidth INTEGER,
    IN p_AllowUpdateAPI BOOLEAN,
    IN p_AllowUpdateInView BOOLEAN,
    IN p_IncludeInUserSearchAPI BOOLEAN,
    IN p_FullTextSearchEnabled BOOLEAN,
    IN p_UserSearchParamFormatAPI VARCHAR(500),
    IN p_IncludeInGeneratedForm BOOLEAN,
    IN p_GeneratedFormSection VARCHAR(10),
    IN p_IsNameField BOOLEAN,
    IN p_RelatedEntityID UUID,
    IN p_RelatedEntityFieldName VARCHAR(255),
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN,
    IN p_RelatedEntityNameFieldMap VARCHAR(255),
    IN p_RelatedEntityDisplayType VARCHAR(20),
    IN p_EntityIDFieldName VARCHAR(100),
    IN p_ScopeDefault VARCHAR(100),
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN,
    IN p_ValuesToPackWithSchema VARCHAR(10),
    IN p_Status VARCHAR(25),
    IN p_AutoUpdateIsNameField BOOLEAN,
    IN p_AutoUpdateDefaultInView BOOLEAN,
    IN p_AutoUpdateCategory BOOLEAN,
    IN p_AutoUpdateDisplayName BOOLEAN,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN,
    IN p_Encrypt BOOLEAN,
    IN p_EncryptionKeyID UUID,
    IN p_AllowDecryptInAPI BOOLEAN,
    IN p_SendEncryptedValue BOOLEAN,
    IN p_IsSoftPrimaryKey BOOLEAN,
    IN p_IsSoftForeignKey BOOLEAN,
    IN p_RelatedEntityJoinFields TEXT
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityField"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateTestRunFeedback"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ReviewerUserID UUID DEFAULT NULL,
    IN p_Rating INTEGER DEFAULT NULL,
    IN p_IsCorrect BOOLEAN DEFAULT NULL,
    IN p_CorrectionSummary TEXT DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ReviewedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwTestRunFeedbacks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TestRunFeedback"
            (
                "ID",
                "TestRunID",
                "ReviewerUserID",
                "Rating",
                "IsCorrect",
                "CorrectionSummary",
                "Comments",
                "ReviewedAt"
            )
        VALUES
            (
                p_ID,
                p_TestRunID,
                p_ReviewerUserID,
                p_Rating,
                p_IsCorrect,
                p_CorrectionSummary,
                p_Comments,
                COALESCE(p_ReviewedAt, NOW())
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TestRunFeedback"
            (
                "TestRunID",
                "ReviewerUserID",
                "Rating",
                "IsCorrect",
                "CorrectionSummary",
                "Comments",
                "ReviewedAt"
            )
        VALUES
            (
                p_TestRunID,
                p_ReviewerUserID,
                p_Rating,
                p_IsCorrect,
                p_CorrectionSummary,
                p_Comments,
                COALESCE(p_ReviewedAt, NOW())
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTestRunFeedbacks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityFieldValue"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityFieldID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Value VARCHAR(255) DEFAULT NULL,
    IN p_Code VARCHAR(50) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFieldValues" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityFieldValue"
            (
                "ID",
                "EntityFieldID",
                "Sequence",
                "Value",
                "Code",
                "Description"
            )
        VALUES
            (
                p_ID,
                p_EntityFieldID,
                p_Sequence,
                p_Value,
                p_Code,
                p_Description
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityFieldValue"
            (
                "EntityFieldID",
                "Sequence",
                "Value",
                "Code",
                "Description"
            )
        VALUES
            (
                p_EntityFieldID,
                p_Sequence,
                p_Value,
                p_Code,
                p_Description
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityRelationship"(
    IN p_ID UUID,
    IN p_EntityID UUID,
    IN p_Sequence INTEGER,
    IN p_RelatedEntityID UUID,
    IN p_BundleInAPI BOOLEAN,
    IN p_IncludeInParentAllQuery BOOLEAN,
    IN p_Type CHAR(20),
    IN p_EntityKeyField VARCHAR(255),
    IN p_RelatedEntityJoinField VARCHAR(255),
    IN p_JoinView VARCHAR(255),
    IN p_JoinEntityJoinField VARCHAR(255),
    IN p_JoinEntityInverseJoinField VARCHAR(255),
    IN p_DisplayInForm BOOLEAN,
    IN p_DisplayLocation VARCHAR(50),
    IN p_DisplayName VARCHAR(255),
    IN p_DisplayIconType VARCHAR(50),
    IN p_DisplayIcon VARCHAR(255),
    IN p_DisplayComponentID UUID,
    IN p_DisplayComponentConfiguration TEXT,
    IN p_AutoUpdateFromSchema BOOLEAN,
    IN p_AdditionalFieldsToInclude TEXT,
    IN p_AutoUpdateAdditionalFieldsToInclude BOOLEAN
)
RETURNS SETOF __mj."vwEntityRelationships" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityRelationship"
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
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityRelationships" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityCommunicationField"(
    IN p_ID UUID,
    IN p_EntityCommunicationMessageTypeID UUID,
    IN p_FieldName VARCHAR(500),
    IN p_Priority INTEGER
)
RETURNS SETOF __mj."vwEntityCommunicationFields" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityCommunicationField"
    SET
        "EntityCommunicationMessageTypeID" = p_EntityCommunicationMessageTypeID,
        "FieldName" = p_FieldName,
        "Priority" = p_Priority
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityCommunicationFields" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityCommunicationFields" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationURLFormat"(
    IN p_ID UUID DEFAULT NULL,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_URLFormat VARCHAR(500) DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationURLFormats" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IntegrationURLFormat"
            (
                "ID",
                "IntegrationID",
                "EntityID",
                "URLFormat",
                "Comments"
            )
        VALUES
            (
                p_ID,
                p_IntegrationID,
                p_EntityID,
                p_URLFormat,
                p_Comments
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IntegrationURLFormat"
            (
                "IntegrationID",
                "EntityID",
                "URLFormat",
                "Comments"
            )
        VALUES
            (
                p_IntegrationID,
                p_EntityID,
                p_URLFormat,
                p_Comments
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrationURLFormats" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateDuplicateRunDetail"(
    IN p_ID UUID,
    IN p_DuplicateRunID UUID,
    IN p_RecordID VARCHAR(500),
    IN p_MatchStatus VARCHAR(20),
    IN p_SkippedReason TEXT,
    IN p_MatchErrorMessage TEXT,
    IN p_MergeStatus VARCHAR(20),
    IN p_MergeErrorMessage TEXT
)
RETURNS SETOF __mj."vwDuplicateRunDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."DuplicateRunDetail"
    SET
        "DuplicateRunID" = p_DuplicateRunID,
        "RecordID" = p_RecordID,
        "MatchStatus" = p_MatchStatus,
        "SkippedReason" = p_SkippedReason,
        "MatchErrorMessage" = p_MatchErrorMessage,
        "MergeStatus" = p_MergeStatus,
        "MergeErrorMessage" = p_MergeErrorMessage
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwDuplicateRunDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateUserFavorite"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(450) DEFAULT NULL
)
RETURNS SETOF __mj."vwUserFavorites" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."UserFavorite"
            (
                "ID",
                "UserID",
                "EntityID",
                "RecordID"
            )
        VALUES
            (
                p_ID,
                p_UserID,
                p_EntityID,
                p_RecordID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."UserFavorite"
            (
                "UserID",
                "EntityID",
                "RecordID"
            )
        VALUES
            (
                p_UserID,
                p_EntityID,
                p_RecordID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwUserFavorites" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

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
    IN p_PriorVersionID UUID DEFAULT NULL
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
                "PriorVersionID"
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
                p_PriorVersionID
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
                "PriorVersionID"
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
                p_PriorVersionID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionFilter"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_ActionFilterID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionFilters" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityActionFilter"
            (
                "ID",
                "EntityActionID",
                "ActionFilterID",
                "Sequence",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityActionID,
                p_ActionFilterID,
                p_Sequence,
                COALESCE(p_Status, 'Pending')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityActionFilter"
            (
                "EntityActionID",
                "ActionFilterID",
                "Sequence",
                "Status"
            )
        VALUES
            (
                p_EntityActionID,
                p_ActionFilterID,
                p_Sequence,
                COALESCE(p_Status, 'Pending')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserApplicationEntity"(
    IN p_ID UUID,
    IN p_UserApplicationID UUID,
    IN p_EntityID UUID,
    IN p_Sequence INTEGER
)
RETURNS SETOF __mj."vwUserApplicationEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."UserApplicationEntity"
    SET
        "UserApplicationID" = p_UserApplicationID,
        "EntityID" = p_EntityID,
        "Sequence" = p_Sequence
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwUserApplicationEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwUserApplicationEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAICredentialBinding"(
    IN p_ID UUID,
    IN p_CredentialID UUID,
    IN p_BindingType VARCHAR(20),
    IN p_AIVendorID UUID,
    IN p_AIModelVendorID UUID,
    IN p_AIPromptModelID UUID,
    IN p_Priority INTEGER,
    IN p_IsActive BOOLEAN
)
RETURNS SETOF __mj."vwAICredentialBindings" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AICredentialBinding"
    SET
        "CredentialID" = p_CredentialID,
        "BindingType" = p_BindingType,
        "AIVendorID" = p_AIVendorID,
        "AIModelVendorID" = p_AIModelVendorID,
        "AIPromptModelID" = p_AIPromptModelID,
        "Priority" = p_Priority,
        "IsActive" = p_IsActive
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAICredentialBindings" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAICredentialBindings" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordChange"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(750) DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_Source VARCHAR(20) DEFAULT NULL,
    IN p_ChangedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ChangesJSON TEXT DEFAULT NULL,
    IN p_ChangesDescription TEXT DEFAULT NULL,
    IN p_FullRecordJSON TEXT DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_ErrorLog TEXT DEFAULT NULL,
    IN p_ReplayRunID UUID DEFAULT NULL,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."RecordChange"
            (
                "ID",
                "EntityID",
                "RecordID",
                "UserID",
                "Type",
                "Source",
                "ChangedAt",
                "ChangesJSON",
                "ChangesDescription",
                "FullRecordJSON",
                "Status",
                "ErrorLog",
                "ReplayRunID",
                "IntegrationID",
                "Comments"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_RecordID,
                p_UserID,
                COALESCE(p_Type, 'Create'),
                COALESCE(p_Source, 'Internal'),
                COALESCE(p_ChangedAt, NOW()),
                p_ChangesJSON,
                p_ChangesDescription,
                p_FullRecordJSON,
                COALESCE(p_Status, 'Complete'),
                p_ErrorLog,
                p_ReplayRunID,
                p_IntegrationID,
                p_Comments
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."RecordChange"
            (
                "EntityID",
                "RecordID",
                "UserID",
                "Type",
                "Source",
                "ChangedAt",
                "ChangesJSON",
                "ChangesDescription",
                "FullRecordJSON",
                "Status",
                "ErrorLog",
                "ReplayRunID",
                "IntegrationID",
                "Comments"
            )
        VALUES
            (
                p_EntityID,
                p_RecordID,
                p_UserID,
                COALESCE(p_Type, 'Create'),
                COALESCE(p_Source, 'Internal'),
                COALESCE(p_ChangedAt, NOW()),
                p_ChangesJSON,
                p_ChangesDescription,
                p_FullRecordJSON,
                COALESCE(p_Status, 'Complete'),
                p_ErrorLog,
                p_ReplayRunID,
                p_IntegrationID,
                p_Comments
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionInvocation"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_InvocationTypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionInvocations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityActionInvocation"
            (
                "ID",
                "EntityActionID",
                "InvocationTypeID",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityActionID,
                p_InvocationTypeID,
                COALESCE(p_Status, 'Pending')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityActionInvocation"
            (
                "EntityActionID",
                "InvocationTypeID",
                "Status"
            )
        VALUES
            (
                p_EntityActionID,
                p_InvocationTypeID,
                COALESCE(p_Status, 'Pending')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFieldValue"(
    IN p_ID UUID,
    IN p_EntityFieldID UUID,
    IN p_Sequence INTEGER,
    IN p_Value VARCHAR(255),
    IN p_Code VARCHAR(50),
    IN p_Description TEXT
)
RETURNS SETOF __mj."vwEntityFieldValues" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityFieldValue"
    SET
        "EntityFieldID" = p_EntityFieldID,
        "Sequence" = p_Sequence,
        "Value" = p_Value,
        "Code" = p_Code,
        "Description" = p_Description
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFieldValues" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplicationEntity"(
    IN p_ID UUID,
    IN p_ApplicationID UUID,
    IN p_EntityID UUID,
    IN p_Sequence INTEGER,
    IN p_DefaultForNewUser BOOLEAN
)
RETURNS SETOF __mj."vwApplicationEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ApplicationEntity"
    SET
        "ApplicationID" = p_ApplicationID,
        "EntityID" = p_EntityID,
        "Sequence" = p_Sequence,
        "DefaultForNewUser" = p_DefaultForNewUser
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwApplicationEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCommunicationLog"(
    IN p_ID UUID,
    IN p_CommunicationProviderID UUID,
    IN p_CommunicationProviderMessageTypeID UUID,
    IN p_CommunicationRunID UUID,
    IN p_Direction VARCHAR(20),
    IN p_MessageDate TIMESTAMPTZ,
    IN p_Status VARCHAR(20),
    IN p_MessageContent TEXT,
    IN p_ErrorMessage TEXT
)
RETURNS SETOF __mj."vwCommunicationLogs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CommunicationLog"
    SET
        "CommunicationProviderID" = p_CommunicationProviderID,
        "CommunicationProviderMessageTypeID" = p_CommunicationProviderMessageTypeID,
        "CommunicationRunID" = p_CommunicationRunID,
        "Direction" = p_Direction,
        "MessageDate" = p_MessageDate,
        "Status" = p_Status,
        "MessageContent" = p_MessageContent,
        "ErrorMessage" = p_ErrorMessage
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCommunicationLogs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCommunicationLogs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ExternalID VARCHAR(100) DEFAULT NULL,
    IN p_Role VARCHAR(20) DEFAULT NULL,
    IN p_Message TEXT DEFAULT NULL,
    IN p_Error TEXT DEFAULT NULL,
    IN p_HiddenToUser BOOLEAN DEFAULT NULL,
    IN p_UserRating INTEGER DEFAULT NULL,
    IN p_UserFeedback TEXT DEFAULT NULL,
    IN p_ReflectionInsights TEXT DEFAULT NULL,
    IN p_SummaryOfEarlierConversation TEXT DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_CompletionTime BIGINT DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SuggestedResponses TEXT DEFAULT NULL,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ResponseForm TEXT DEFAULT NULL,
    IN p_ActionableCommands TEXT DEFAULT NULL,
    IN p_AutomaticCommands TEXT DEFAULT NULL,
    IN p_OriginalMessageChanged BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationDetail"
            (
                "ID",
                "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged"
            )
        VALUES
            (
                p_ID,
                p_ConversationID,
                p_ExternalID,
                COALESCE(p_Role, current_user),
                p_Message,
                p_Error,
                COALESCE(p_HiddenToUser, FALSE),
                p_UserRating,
                p_UserFeedback,
                p_ReflectionInsights,
                p_SummaryOfEarlierConversation,
                p_UserID,
                p_ArtifactID,
                p_ArtifactVersionID,
                p_CompletionTime,
                COALESCE(p_IsPinned, FALSE),
                p_ParentID,
                p_AgentID,
                COALESCE(p_Status, 'Complete'),
                p_SuggestedResponses,
                p_TestRunID,
                p_ResponseForm,
                p_ActionableCommands,
                p_AutomaticCommands,
                COALESCE(p_OriginalMessageChanged, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationDetail"
            (
                "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged"
            )
        VALUES
            (
                p_ConversationID,
                p_ExternalID,
                COALESCE(p_Role, current_user),
                p_Message,
                p_Error,
                COALESCE(p_HiddenToUser, FALSE),
                p_UserRating,
                p_UserFeedback,
                p_ReflectionInsights,
                p_SummaryOfEarlierConversation,
                p_UserID,
                p_ArtifactID,
                p_ArtifactVersionID,
                p_CompletionTime,
                COALESCE(p_IsPinned, FALSE),
                p_ParentID,
                p_AgentID,
                COALESCE(p_Status, 'Complete'),
                p_SuggestedResponses,
                p_TestRunID,
                p_ResponseForm,
                p_ActionableCommands,
                p_AutomaticCommands,
                COALESCE(p_OriginalMessageChanged, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_PromptID UUID DEFAULT NULL,
    IN p_ModelID UUID DEFAULT NULL,
    IN p_VendorID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_ConfigurationID UUID DEFAULT NULL,
    IN p_RunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ExecutionTimeMS INTEGER DEFAULT NULL,
    IN p_Messages TEXT DEFAULT NULL,
    IN p_Result TEXT DEFAULT NULL,
    IN p_TokensUsed INTEGER DEFAULT NULL,
    IN p_TokensPrompt INTEGER DEFAULT NULL,
    IN p_TokensCompletion INTEGER DEFAULT NULL,
    IN p_TotalCost NUMERIC(18,6) DEFAULT NULL,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_RunType VARCHAR(20) DEFAULT NULL,
    IN p_ExecutionOrder INTEGER DEFAULT NULL,
    IN p_AgentRunID UUID DEFAULT NULL,
    IN p_Cost NUMERIC(19,8) DEFAULT NULL,
    IN p_CostCurrency VARCHAR(10) DEFAULT NULL,
    IN p_TokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TokensPromptRollup INTEGER DEFAULT NULL,
    IN p_TokensCompletionRollup INTEGER DEFAULT NULL,
    IN p_Temperature NUMERIC(3,2) DEFAULT NULL,
    IN p_TopP NUMERIC(3,2) DEFAULT NULL,
    IN p_TopK INTEGER DEFAULT NULL,
    IN p_MinP NUMERIC(3,2) DEFAULT NULL,
    IN p_FrequencyPenalty NUMERIC(3,2) DEFAULT NULL,
    IN p_PresencePenalty NUMERIC(3,2) DEFAULT NULL,
    IN p_Seed INTEGER DEFAULT NULL,
    IN p_StopSequences TEXT DEFAULT NULL,
    IN p_ResponseFormat VARCHAR(50) DEFAULT NULL,
    IN p_LogProbs BOOLEAN DEFAULT NULL,
    IN p_TopLogProbs INTEGER DEFAULT NULL,
    IN p_DescendantCost NUMERIC(18,6) DEFAULT NULL,
    IN p_ValidationAttemptCount INTEGER DEFAULT NULL,
    IN p_SuccessfulValidationCount INTEGER DEFAULT NULL,
    IN p_FinalValidationPassed BOOLEAN DEFAULT NULL,
    IN p_ValidationBehavior VARCHAR(50) DEFAULT NULL,
    IN p_RetryStrategy VARCHAR(50) DEFAULT NULL,
    IN p_MaxRetriesConfigured INTEGER DEFAULT NULL,
    IN p_FinalValidationError VARCHAR(500) DEFAULT NULL,
    IN p_ValidationErrorCount INTEGER DEFAULT NULL,
    IN p_CommonValidationError VARCHAR(255) DEFAULT NULL,
    IN p_FirstAttemptAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastAttemptAt TIMESTAMPTZ DEFAULT NULL,
    IN p_TotalRetryDurationMS INTEGER DEFAULT NULL,
    IN p_ValidationAttempts TEXT DEFAULT NULL,
    IN p_ValidationSummary TEXT DEFAULT NULL,
    IN p_FailoverAttempts INTEGER DEFAULT NULL,
    IN p_FailoverErrors TEXT DEFAULT NULL,
    IN p_FailoverDurations TEXT DEFAULT NULL,
    IN p_OriginalModelID UUID DEFAULT NULL,
    IN p_OriginalRequestStartTime TIMESTAMPTZ DEFAULT NULL,
    IN p_TotalFailoverDuration INTEGER DEFAULT NULL,
    IN p_RerunFromPromptRunID UUID DEFAULT NULL,
    IN p_ModelSelection TEXT DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_Cancelled BOOLEAN DEFAULT NULL,
    IN p_CancellationReason TEXT DEFAULT NULL,
    IN p_ModelPowerRank INTEGER DEFAULT NULL,
    IN p_SelectionStrategy VARCHAR(50) DEFAULT NULL,
    IN p_CacheHit BOOLEAN DEFAULT NULL,
    IN p_CacheKey VARCHAR(500) DEFAULT NULL,
    IN p_JudgeID UUID DEFAULT NULL,
    IN p_JudgeScore DOUBLE PRECISION DEFAULT NULL,
    IN p_WasSelectedResult BOOLEAN DEFAULT NULL,
    IN p_StreamingEnabled BOOLEAN DEFAULT NULL,
    IN p_FirstTokenTime INTEGER DEFAULT NULL,
    IN p_ErrorDetails TEXT DEFAULT NULL,
    IN p_ChildPromptID UUID DEFAULT NULL,
    IN p_QueueTime INTEGER DEFAULT NULL,
    IN p_PromptTime INTEGER DEFAULT NULL,
    IN p_CompletionTime INTEGER DEFAULT NULL,
    IN p_ModelSpecificResponseDetails TEXT DEFAULT NULL,
    IN p_EffortLevel INTEGER DEFAULT NULL,
    IN p_RunName VARCHAR(255) DEFAULT NULL,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_TestRunID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAIPromptRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIPromptRun"
            (
                "ID",
                "PromptID",
                "ModelID",
                "VendorID",
                "AgentID",
                "ConfigurationID",
                "RunAt",
                "CompletedAt",
                "ExecutionTimeMS",
                "Messages",
                "Result",
                "TokensUsed",
                "TokensPrompt",
                "TokensCompletion",
                "TotalCost",
                "Success",
                "ErrorMessage",
                "ParentID",
                "RunType",
                "ExecutionOrder",
                "AgentRunID",
                "Cost",
                "CostCurrency",
                "TokensUsedRollup",
                "TokensPromptRollup",
                "TokensCompletionRollup",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "ResponseFormat",
                "LogProbs",
                "TopLogProbs",
                "DescendantCost",
                "ValidationAttemptCount",
                "SuccessfulValidationCount",
                "FinalValidationPassed",
                "ValidationBehavior",
                "RetryStrategy",
                "MaxRetriesConfigured",
                "FinalValidationError",
                "ValidationErrorCount",
                "CommonValidationError",
                "FirstAttemptAt",
                "LastAttemptAt",
                "TotalRetryDurationMS",
                "ValidationAttempts",
                "ValidationSummary",
                "FailoverAttempts",
                "FailoverErrors",
                "FailoverDurations",
                "OriginalModelID",
                "OriginalRequestStartTime",
                "TotalFailoverDuration",
                "RerunFromPromptRunID",
                "ModelSelection",
                "Status",
                "Cancelled",
                "CancellationReason",
                "ModelPowerRank",
                "SelectionStrategy",
                "CacheHit",
                "CacheKey",
                "JudgeID",
                "JudgeScore",
                "WasSelectedResult",
                "StreamingEnabled",
                "FirstTokenTime",
                "ErrorDetails",
                "ChildPromptID",
                "QueueTime",
                "PromptTime",
                "CompletionTime",
                "ModelSpecificResponseDetails",
                "EffortLevel",
                "RunName",
                "Comments",
                "TestRunID"
            )
        VALUES
            (
                p_ID,
                p_PromptID,
                p_ModelID,
                p_VendorID,
                p_AgentID,
                p_ConfigurationID,
                COALESCE(p_RunAt, NOW()),
                p_CompletedAt,
                p_ExecutionTimeMS,
                p_Messages,
                p_Result,
                p_TokensUsed,
                p_TokensPrompt,
                p_TokensCompletion,
                p_TotalCost,
                COALESCE(p_Success, FALSE),
                p_ErrorMessage,
                p_ParentID,
                COALESCE(p_RunType, 'Single'),
                p_ExecutionOrder,
                p_AgentRunID,
                p_Cost,
                p_CostCurrency,
                p_TokensUsedRollup,
                p_TokensPromptRollup,
                p_TokensCompletionRollup,
                p_Temperature,
                p_TopP,
                p_TopK,
                p_MinP,
                p_FrequencyPenalty,
                p_PresencePenalty,
                p_Seed,
                p_StopSequences,
                p_ResponseFormat,
                p_LogProbs,
                p_TopLogProbs,
                p_DescendantCost,
                p_ValidationAttemptCount,
                p_SuccessfulValidationCount,
                p_FinalValidationPassed,
                p_ValidationBehavior,
                p_RetryStrategy,
                p_MaxRetriesConfigured,
                p_FinalValidationError,
                p_ValidationErrorCount,
                p_CommonValidationError,
                p_FirstAttemptAt,
                p_LastAttemptAt,
                p_TotalRetryDurationMS,
                p_ValidationAttempts,
                p_ValidationSummary,
                p_FailoverAttempts,
                p_FailoverErrors,
                p_FailoverDurations,
                p_OriginalModelID,
                p_OriginalRequestStartTime,
                p_TotalFailoverDuration,
                p_RerunFromPromptRunID,
                p_ModelSelection,
                COALESCE(p_Status, 'Pending'),
                COALESCE(p_Cancelled, FALSE),
                p_CancellationReason,
                p_ModelPowerRank,
                p_SelectionStrategy,
                COALESCE(p_CacheHit, FALSE),
                p_CacheKey,
                p_JudgeID,
                p_JudgeScore,
                COALESCE(p_WasSelectedResult, FALSE),
                COALESCE(p_StreamingEnabled, FALSE),
                p_FirstTokenTime,
                p_ErrorDetails,
                p_ChildPromptID,
                p_QueueTime,
                p_PromptTime,
                p_CompletionTime,
                p_ModelSpecificResponseDetails,
                p_EffortLevel,
                p_RunName,
                p_Comments,
                p_TestRunID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIPromptRun"
            (
                "PromptID",
                "ModelID",
                "VendorID",
                "AgentID",
                "ConfigurationID",
                "RunAt",
                "CompletedAt",
                "ExecutionTimeMS",
                "Messages",
                "Result",
                "TokensUsed",
                "TokensPrompt",
                "TokensCompletion",
                "TotalCost",
                "Success",
                "ErrorMessage",
                "ParentID",
                "RunType",
                "ExecutionOrder",
                "AgentRunID",
                "Cost",
                "CostCurrency",
                "TokensUsedRollup",
                "TokensPromptRollup",
                "TokensCompletionRollup",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "ResponseFormat",
                "LogProbs",
                "TopLogProbs",
                "DescendantCost",
                "ValidationAttemptCount",
                "SuccessfulValidationCount",
                "FinalValidationPassed",
                "ValidationBehavior",
                "RetryStrategy",
                "MaxRetriesConfigured",
                "FinalValidationError",
                "ValidationErrorCount",
                "CommonValidationError",
                "FirstAttemptAt",
                "LastAttemptAt",
                "TotalRetryDurationMS",
                "ValidationAttempts",
                "ValidationSummary",
                "FailoverAttempts",
                "FailoverErrors",
                "FailoverDurations",
                "OriginalModelID",
                "OriginalRequestStartTime",
                "TotalFailoverDuration",
                "RerunFromPromptRunID",
                "ModelSelection",
                "Status",
                "Cancelled",
                "CancellationReason",
                "ModelPowerRank",
                "SelectionStrategy",
                "CacheHit",
                "CacheKey",
                "JudgeID",
                "JudgeScore",
                "WasSelectedResult",
                "StreamingEnabled",
                "FirstTokenTime",
                "ErrorDetails",
                "ChildPromptID",
                "QueueTime",
                "PromptTime",
                "CompletionTime",
                "ModelSpecificResponseDetails",
                "EffortLevel",
                "RunName",
                "Comments",
                "TestRunID"
            )
        VALUES
            (
                p_PromptID,
                p_ModelID,
                p_VendorID,
                p_AgentID,
                p_ConfigurationID,
                COALESCE(p_RunAt, NOW()),
                p_CompletedAt,
                p_ExecutionTimeMS,
                p_Messages,
                p_Result,
                p_TokensUsed,
                p_TokensPrompt,
                p_TokensCompletion,
                p_TotalCost,
                COALESCE(p_Success, FALSE),
                p_ErrorMessage,
                p_ParentID,
                COALESCE(p_RunType, 'Single'),
                p_ExecutionOrder,
                p_AgentRunID,
                p_Cost,
                p_CostCurrency,
                p_TokensUsedRollup,
                p_TokensPromptRollup,
                p_TokensCompletionRollup,
                p_Temperature,
                p_TopP,
                p_TopK,
                p_MinP,
                p_FrequencyPenalty,
                p_PresencePenalty,
                p_Seed,
                p_StopSequences,
                p_ResponseFormat,
                p_LogProbs,
                p_TopLogProbs,
                p_DescendantCost,
                p_ValidationAttemptCount,
                p_SuccessfulValidationCount,
                p_FinalValidationPassed,
                p_ValidationBehavior,
                p_RetryStrategy,
                p_MaxRetriesConfigured,
                p_FinalValidationError,
                p_ValidationErrorCount,
                p_CommonValidationError,
                p_FirstAttemptAt,
                p_LastAttemptAt,
                p_TotalRetryDurationMS,
                p_ValidationAttempts,
                p_ValidationSummary,
                p_FailoverAttempts,
                p_FailoverErrors,
                p_FailoverDurations,
                p_OriginalModelID,
                p_OriginalRequestStartTime,
                p_TotalFailoverDuration,
                p_RerunFromPromptRunID,
                p_ModelSelection,
                COALESCE(p_Status, 'Pending'),
                COALESCE(p_Cancelled, FALSE),
                p_CancellationReason,
                p_ModelPowerRank,
                p_SelectionStrategy,
                COALESCE(p_CacheHit, FALSE),
                p_CacheKey,
                p_JudgeID,
                p_JudgeScore,
                COALESCE(p_WasSelectedResult, FALSE),
                COALESCE(p_StreamingEnabled, FALSE),
                p_FirstTokenTime,
                p_ErrorDetails,
                p_ChildPromptID,
                p_QueueTime,
                p_PromptTime,
                p_CompletionTime,
                p_ModelSpecificResponseDetails,
                p_EffortLevel,
                p_RunName,
                p_Comments,
                p_TestRunID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateEntity"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_NameSuffix VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL,
    IN p_BaseView VARCHAR(255) DEFAULT NULL,
    IN p_BaseViewGenerated BOOLEAN DEFAULT NULL,
    IN p_VirtualEntity BOOLEAN DEFAULT NULL,
    IN p_TrackRecordChanges BOOLEAN DEFAULT NULL,
    IN p_AuditRecordAccess BOOLEAN DEFAULT NULL,
    IN p_AuditViewRuns BOOLEAN DEFAULT NULL,
    IN p_IncludeInAPI BOOLEAN DEFAULT NULL,
    IN p_AllowAllRowsAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowCreateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowDeleteAPI BOOLEAN DEFAULT NULL,
    IN p_CustomResolverAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL,
    IN p_FullTextCatalog VARCHAR(255) DEFAULT NULL,
    IN p_FullTextCatalogGenerated BOOLEAN DEFAULT NULL,
    IN p_FullTextIndex VARCHAR(255) DEFAULT NULL,
    IN p_FullTextIndexGenerated BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchFunction VARCHAR(255) DEFAULT NULL,
    IN p_FullTextSearchFunctionGenerated BOOLEAN DEFAULT NULL,
    IN p_UserViewMaxRows INTEGER DEFAULT NULL,
    IN p_spCreate VARCHAR(255) DEFAULT NULL,
    IN p_spUpdate VARCHAR(255) DEFAULT NULL,
    IN p_spDelete VARCHAR(255) DEFAULT NULL,
    IN p_spCreateGenerated BOOLEAN DEFAULT NULL,
    IN p_spUpdateGenerated BOOLEAN DEFAULT NULL,
    IN p_spDeleteGenerated BOOLEAN DEFAULT NULL,
    IN p_CascadeDeletes BOOLEAN DEFAULT NULL,
    IN p_DeleteType VARCHAR(10) DEFAULT NULL,
    IN p_AllowRecordMerge BOOLEAN DEFAULT NULL,
    IN p_spMatch VARCHAR(255) DEFAULT NULL,
    IN p_RelationshipDefaultDisplayType VARCHAR(20) DEFAULT NULL,
    IN p_UserFormGenerated BOOLEAN DEFAULT NULL,
    IN p_EntityObjectSubclassName VARCHAR(255) DEFAULT NULL,
    IN p_EntityObjectSubclassImport VARCHAR(255) DEFAULT NULL,
    IN p_PreferredCommunicationField VARCHAR(255) DEFAULT NULL,
    IN p_Icon VARCHAR(500) DEFAULT NULL,
    IN p_ScopeDefault VARCHAR(100) DEFAULT NULL,
    IN p_RowsToPackWithSchema VARCHAR(20) DEFAULT NULL,
    IN p_RowsToPackSampleMethod VARCHAR(20) DEFAULT NULL,
    IN p_RowsToPackSampleCount INTEGER DEFAULT NULL,
    IN p_RowsToPackSampleOrder TEXT DEFAULT NULL,
    IN p_AutoRowCountFrequency INTEGER DEFAULT NULL,
    IN p_RowCount BIGINT DEFAULT NULL,
    IN p_RowCountRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_AllowMultipleSubtypes BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntities" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Entity"
            (
                "ID",
                "ParentID",
                "Name",
                "NameSuffix",
                "Description",
                "AutoUpdateDescription",
                "BaseView",
                "BaseViewGenerated",
                "VirtualEntity",
                "TrackRecordChanges",
                "AuditRecordAccess",
                "AuditViewRuns",
                "IncludeInAPI",
                "AllowAllRowsAPI",
                "AllowUpdateAPI",
                "AllowCreateAPI",
                "AllowDeleteAPI",
                "CustomResolverAPI",
                "AllowUserSearchAPI",
                "FullTextSearchEnabled",
                "FullTextCatalog",
                "FullTextCatalogGenerated",
                "FullTextIndex",
                "FullTextIndexGenerated",
                "FullTextSearchFunction",
                "FullTextSearchFunctionGenerated",
                "UserViewMaxRows",
                "spCreate",
                "spUpdate",
                "spDelete",
                "spCreateGenerated",
                "spUpdateGenerated",
                "spDeleteGenerated",
                "CascadeDeletes",
                "DeleteType",
                "AllowRecordMerge",
                "spMatch",
                "RelationshipDefaultDisplayType",
                "UserFormGenerated",
                "EntityObjectSubclassName",
                "EntityObjectSubclassImport",
                "PreferredCommunicationField",
                "Icon",
                "ScopeDefault",
                "RowsToPackWithSchema",
                "RowsToPackSampleMethod",
                "RowsToPackSampleCount",
                "RowsToPackSampleOrder",
                "AutoRowCountFrequency",
                "RowCount",
                "RowCountRunAt",
                "Status",
                "DisplayName",
                "AllowMultipleSubtypes"
            )
        VALUES
            (
                p_ID,
                p_ParentID,
                p_Name,
                p_NameSuffix,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                p_BaseView,
                COALESCE(p_BaseViewGenerated, TRUE),
                COALESCE(p_VirtualEntity, FALSE),
                COALESCE(p_TrackRecordChanges, TRUE),
                COALESCE(p_AuditRecordAccess, TRUE),
                COALESCE(p_AuditViewRuns, TRUE),
                COALESCE(p_IncludeInAPI, FALSE),
                COALESCE(p_AllowAllRowsAPI, FALSE),
                COALESCE(p_AllowUpdateAPI, FALSE),
                COALESCE(p_AllowCreateAPI, FALSE),
                COALESCE(p_AllowDeleteAPI, FALSE),
                COALESCE(p_CustomResolverAPI, FALSE),
                COALESCE(p_AllowUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_FullTextCatalog,
                COALESCE(p_FullTextCatalogGenerated, TRUE),
                p_FullTextIndex,
                COALESCE(p_FullTextIndexGenerated, TRUE),
                p_FullTextSearchFunction,
                COALESCE(p_FullTextSearchFunctionGenerated, TRUE),
                p_UserViewMaxRows,
                p_spCreate,
                p_spUpdate,
                p_spDelete,
                COALESCE(p_spCreateGenerated, TRUE),
                COALESCE(p_spUpdateGenerated, TRUE),
                COALESCE(p_spDeleteGenerated, TRUE),
                COALESCE(p_CascadeDeletes, FALSE),
                COALESCE(p_DeleteType, 'Hard'),
                COALESCE(p_AllowRecordMerge, FALSE),
                p_spMatch,
                COALESCE(p_RelationshipDefaultDisplayType, 'Search'),
                COALESCE(p_UserFormGenerated, TRUE),
                p_EntityObjectSubclassName,
                p_EntityObjectSubclassImport,
                p_PreferredCommunicationField,
                p_Icon,
                p_ScopeDefault,
                COALESCE(p_RowsToPackWithSchema, 'None'),
                COALESCE(p_RowsToPackSampleMethod, 'random'),
                COALESCE(p_RowsToPackSampleCount, 0),
                p_RowsToPackSampleOrder,
                p_AutoRowCountFrequency,
                p_RowCount,
                p_RowCountRunAt,
                COALESCE(p_Status, 'Active'),
                p_DisplayName,
                COALESCE(p_AllowMultipleSubtypes, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Entity"
            (
                "ParentID",
                "Name",
                "NameSuffix",
                "Description",
                "AutoUpdateDescription",
                "BaseView",
                "BaseViewGenerated",
                "VirtualEntity",
                "TrackRecordChanges",
                "AuditRecordAccess",
                "AuditViewRuns",
                "IncludeInAPI",
                "AllowAllRowsAPI",
                "AllowUpdateAPI",
                "AllowCreateAPI",
                "AllowDeleteAPI",
                "CustomResolverAPI",
                "AllowUserSearchAPI",
                "FullTextSearchEnabled",
                "FullTextCatalog",
                "FullTextCatalogGenerated",
                "FullTextIndex",
                "FullTextIndexGenerated",
                "FullTextSearchFunction",
                "FullTextSearchFunctionGenerated",
                "UserViewMaxRows",
                "spCreate",
                "spUpdate",
                "spDelete",
                "spCreateGenerated",
                "spUpdateGenerated",
                "spDeleteGenerated",
                "CascadeDeletes",
                "DeleteType",
                "AllowRecordMerge",
                "spMatch",
                "RelationshipDefaultDisplayType",
                "UserFormGenerated",
                "EntityObjectSubclassName",
                "EntityObjectSubclassImport",
                "PreferredCommunicationField",
                "Icon",
                "ScopeDefault",
                "RowsToPackWithSchema",
                "RowsToPackSampleMethod",
                "RowsToPackSampleCount",
                "RowsToPackSampleOrder",
                "AutoRowCountFrequency",
                "RowCount",
                "RowCountRunAt",
                "Status",
                "DisplayName",
                "AllowMultipleSubtypes"
            )
        VALUES
            (
                p_ParentID,
                p_Name,
                p_NameSuffix,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                p_BaseView,
                COALESCE(p_BaseViewGenerated, TRUE),
                COALESCE(p_VirtualEntity, FALSE),
                COALESCE(p_TrackRecordChanges, TRUE),
                COALESCE(p_AuditRecordAccess, TRUE),
                COALESCE(p_AuditViewRuns, TRUE),
                COALESCE(p_IncludeInAPI, FALSE),
                COALESCE(p_AllowAllRowsAPI, FALSE),
                COALESCE(p_AllowUpdateAPI, FALSE),
                COALESCE(p_AllowCreateAPI, FALSE),
                COALESCE(p_AllowDeleteAPI, FALSE),
                COALESCE(p_CustomResolverAPI, FALSE),
                COALESCE(p_AllowUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_FullTextCatalog,
                COALESCE(p_FullTextCatalogGenerated, TRUE),
                p_FullTextIndex,
                COALESCE(p_FullTextIndexGenerated, TRUE),
                p_FullTextSearchFunction,
                COALESCE(p_FullTextSearchFunctionGenerated, TRUE),
                p_UserViewMaxRows,
                p_spCreate,
                p_spUpdate,
                p_spDelete,
                COALESCE(p_spCreateGenerated, TRUE),
                COALESCE(p_spUpdateGenerated, TRUE),
                COALESCE(p_spDeleteGenerated, TRUE),
                COALESCE(p_CascadeDeletes, FALSE),
                COALESCE(p_DeleteType, 'Hard'),
                COALESCE(p_AllowRecordMerge, FALSE),
                p_spMatch,
                COALESCE(p_RelationshipDefaultDisplayType, 'Search'),
                COALESCE(p_UserFormGenerated, TRUE),
                p_EntityObjectSubclassName,
                p_EntityObjectSubclassImport,
                p_PreferredCommunicationField,
                p_Icon,
                p_ScopeDefault,
                COALESCE(p_RowsToPackWithSchema, 'None'),
                COALESCE(p_RowsToPackSampleMethod, 'random'),
                COALESCE(p_RowsToPackSampleCount, 0),
                p_RowsToPackSampleOrder,
                p_AutoRowCountFrequency,
                p_RowCount,
                p_RowCountRunAt,
                COALESCE(p_Status, 'Active'),
                p_DisplayName,
                COALESCE(p_AllowMultipleSubtypes, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateTestRunFeedback"(
    IN p_ID UUID,
    IN p_TestRunID UUID,
    IN p_ReviewerUserID UUID,
    IN p_Rating INTEGER,
    IN p_IsCorrect BOOLEAN,
    IN p_CorrectionSummary TEXT,
    IN p_Comments TEXT,
    IN p_ReviewedAt TIMESTAMPTZ
)
RETURNS SETOF __mj."vwTestRunFeedbacks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TestRunFeedback"
    SET
        "TestRunID" = p_TestRunID,
        "ReviewerUserID" = p_ReviewerUserID,
        "Rating" = p_Rating,
        "IsCorrect" = p_IsCorrect,
        "CorrectionSummary" = p_CorrectionSummary,
        "Comments" = p_Comments,
        "ReviewedAt" = p_ReviewedAt
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTestRunFeedbacks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTestRunFeedbacks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntity"(
    IN p_ID UUID,
    IN p_ParentID UUID,
    IN p_Name VARCHAR(255),
    IN p_NameSuffix VARCHAR(255),
    IN p_Description TEXT,
    IN p_AutoUpdateDescription BOOLEAN,
    IN p_BaseView VARCHAR(255),
    IN p_BaseViewGenerated BOOLEAN,
    IN p_VirtualEntity BOOLEAN,
    IN p_TrackRecordChanges BOOLEAN,
    IN p_AuditRecordAccess BOOLEAN,
    IN p_AuditViewRuns BOOLEAN,
    IN p_IncludeInAPI BOOLEAN,
    IN p_AllowAllRowsAPI BOOLEAN,
    IN p_AllowUpdateAPI BOOLEAN,
    IN p_AllowCreateAPI BOOLEAN,
    IN p_AllowDeleteAPI BOOLEAN,
    IN p_CustomResolverAPI BOOLEAN,
    IN p_AllowUserSearchAPI BOOLEAN,
    IN p_FullTextSearchEnabled BOOLEAN,
    IN p_FullTextCatalog VARCHAR(255),
    IN p_FullTextCatalogGenerated BOOLEAN,
    IN p_FullTextIndex VARCHAR(255),
    IN p_FullTextIndexGenerated BOOLEAN,
    IN p_FullTextSearchFunction VARCHAR(255),
    IN p_FullTextSearchFunctionGenerated BOOLEAN,
    IN p_UserViewMaxRows INTEGER,
    IN p_spCreate VARCHAR(255),
    IN p_spUpdate VARCHAR(255),
    IN p_spDelete VARCHAR(255),
    IN p_spCreateGenerated BOOLEAN,
    IN p_spUpdateGenerated BOOLEAN,
    IN p_spDeleteGenerated BOOLEAN,
    IN p_CascadeDeletes BOOLEAN,
    IN p_DeleteType VARCHAR(10),
    IN p_AllowRecordMerge BOOLEAN,
    IN p_spMatch VARCHAR(255),
    IN p_RelationshipDefaultDisplayType VARCHAR(20),
    IN p_UserFormGenerated BOOLEAN,
    IN p_EntityObjectSubclassName VARCHAR(255),
    IN p_EntityObjectSubclassImport VARCHAR(255),
    IN p_PreferredCommunicationField VARCHAR(255),
    IN p_Icon VARCHAR(500),
    IN p_ScopeDefault VARCHAR(100),
    IN p_RowsToPackWithSchema VARCHAR(20),
    IN p_RowsToPackSampleMethod VARCHAR(20),
    IN p_RowsToPackSampleCount INTEGER,
    IN p_RowsToPackSampleOrder TEXT,
    IN p_AutoRowCountFrequency INTEGER,
    IN p_RowCount BIGINT,
    IN p_RowCountRunAt TIMESTAMPTZ,
    IN p_Status VARCHAR(25),
    IN p_DisplayName VARCHAR(255),
    IN p_AllowMultipleSubtypes BOOLEAN
)
RETURNS SETOF __mj."vwEntities" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Entity"
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
        "DisplayName" = p_DisplayName,
        "AllowMultipleSubtypes" = p_AllowMultipleSubtypes
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntities" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

