-- Create 24 missing views in PG database
-- These views exist in SQL Server baseline but were not included in PG baseline

-- 1. vwEntities (critical - many views depend on this)
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
CREATE OR REPLACE VIEW __mj."vwEntityActionFilters" AS
SELECT e.* FROM __mj."EntityActionFilter" e;

-- 7. vwEntityActionInvocations
CREATE OR REPLACE VIEW __mj."vwEntityActionInvocations" AS
SELECT
    e.*,
    eit."Name" AS "InvocationType"
FROM
    __mj."EntityActionInvocation" e
INNER JOIN
    __mj."EntityActionInvocationType" eit ON e."InvocationTypeID" = eit."ID";

-- 8. vwEntityActionParams
CREATE OR REPLACE VIEW __mj."vwEntityActionParams" AS
SELECT
    e.*,
    ap."Name" AS "ActionParam"
FROM
    __mj."EntityActionParam" e
INNER JOIN
    __mj."ActionParam" ap ON e."ActionParamID" = ap."ID";

-- 9. vwEntityCommunicationFields
CREATE OR REPLACE VIEW __mj."vwEntityCommunicationFields" AS
SELECT e.* FROM __mj."EntityCommunicationField" e;

-- 10. vwDuplicateRunDetails
CREATE OR REPLACE VIEW __mj."vwDuplicateRunDetails" AS
SELECT d.* FROM __mj."DuplicateRunDetail" d;

-- 11. vwConversations
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
CREATE OR REPLACE VIEW __mj."vwTestRunOutputs" AS
SELECT
    t.*,
    tr."Test" AS "TestRun"
FROM
    __mj."TestRunOutput" t
INNER JOIN
    __mj."vwTestRuns" tr ON t."TestRunID" = tr."ID";

-- 15. vwConversationDetails (depends on vwTestRuns)
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
