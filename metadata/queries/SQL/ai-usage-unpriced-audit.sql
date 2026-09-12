SELECT
    PromptRunID,
    AgentRunID,
    ParentPromptRunID,
    RunAt,
    RunAtUTC,
    PromptID,
    ModelID,
    VendorID,
    AgentID,
    ConfigurationID,
    UserID,
    ConversationID,
    PrimaryScopeEntityID,
    PrimaryScopeRecordID,
    RunType,
    SourceKind,
    Status,
    Success,
    TokensPrompt,
    TokensCompletion,
    TokensCacheRead,
    TokensCacheWrite,
    InputUnitsUsed,
    OutputUnitsUsed,
    ExecutionTimeMS,
    IsUnmeasured,
    CASE
        WHEN IsUnmeasured = 1 THEN 'Unmeasured run: no token or unit counts recorded'
        WHEN ModelID IS NULL THEN 'Missing ModelID: model was not identified'
        ELSE 'Missing pricing: no price tier found for model at run time'
    END AS UnpricedReason
FROM [__mj].vwAIUsageFacts
WHERE IsCompleted = 1
  AND IsPriced = 0
ORDER BY
    RunAtUTC DESC
