SELECT
    HourBucket,
    AgentID,
    PromptID,
    ModelID,
    VendorID,
    UserID,
    PrimaryScopeEntityID,
    PrimaryScopeRecordID,
    ConfigurationID,
    SourceKind,
    COUNT(*) AS Runs,
    SUM(CASE WHEN Success = 1 THEN 1 ELSE 0 END) AS SucceededRuns,
    SUM(CASE WHEN Success = 0 THEN 1 ELSE 0 END) AS FailedRuns,
    SUM(CASE WHEN IsPriced = 1 THEN 1 ELSE 0 END) AS PricedRuns,
    SUM(CASE WHEN IsPriced = 0 THEN 1 ELSE 0 END) AS UnpricedRuns,
    SUM(CASE WHEN IsUnmeasured = 1 THEN 1 ELSE 0 END) AS UnmeasuredRuns,
    SUM(CASE WHEN IsParallelParent = 1 THEN 1 ELSE 0 END) AS ParallelParents,
    SUM(TokensPrompt) AS TokensPrompt,
    SUM(TokensCompletion) AS TokensCompletion,
    SUM(TokensCacheRead) AS TokensCacheRead,
    SUM(TokensCacheWrite) AS TokensCacheWrite,
    SUM(CASE WHEN IsPriced = 1 AND IsParallelParent = 0 THEN OwnCost ELSE 0 END) AS OwnCost,
    APPROX_PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ExecutionTimeMS) AS LatencyP50,
    APPROX_PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ExecutionTimeMS) AS LatencyP95,
    AVG(FirstTokenTime) AS AvgFirstTokenMS
FROM [__mj].vwAIUsageFacts
WHERE IsCompleted = 1
  AND HourBucket >= {{ start | sqlDate }}
  AND HourBucket < {{ end | sqlDate }}
GROUP BY
    HourBucket,
    AgentID,
    PromptID,
    ModelID,
    VendorID,
    UserID,
    PrimaryScopeEntityID,
    PrimaryScopeRecordID,
    ConfigurationID,
    SourceKind
