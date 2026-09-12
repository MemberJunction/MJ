SELECT
    f.DayBucket,
    f.AgentID,
    a.TypeID AS AgentTypeID,
    f.PromptID,
    f.ModelID,
    f.VendorID,
    f.UserID,
    f.PrimaryScopeEntityID,
    f.PrimaryScopeRecordID,
    f.ConfigurationID,
    f.SourceKind,
    COUNT(*) AS Runs,
    SUM(CASE WHEN f.Success = 1 THEN 1 ELSE 0 END) AS SucceededRuns,
    SUM(CASE WHEN f.Success = 0 THEN 1 ELSE 0 END) AS FailedRuns,
    SUM(CASE WHEN f.IsPriced = 1 THEN 1 ELSE 0 END) AS PricedRuns,
    SUM(CASE WHEN f.IsPriced = 0 THEN 1 ELSE 0 END) AS UnpricedRuns,
    SUM(CASE WHEN f.IsUnmeasured = 1 THEN 1 ELSE 0 END) AS UnmeasuredRuns,
    SUM(CASE WHEN f.IsParallelParent = 1 THEN 1 ELSE 0 END) AS ParallelParents,
    SUM(f.TokensPrompt) AS TokensPrompt,
    SUM(f.TokensCompletion) AS TokensCompletion,
    SUM(f.TokensCacheRead) AS TokensCacheRead,
    SUM(f.TokensCacheWrite) AS TokensCacheWrite,
    SUM(CASE WHEN f.IsPriced = 1 AND f.IsParallelParent = 0 THEN f.OwnCost ELSE 0 END) AS OwnCost,
    APPROX_PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.ExecutionTimeMS) AS LatencyP50,
    APPROX_PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY f.ExecutionTimeMS) AS LatencyP95,
    AVG(f.FirstTokenTime) AS AvgFirstTokenMS
FROM [__mj].vwAIUsageFacts f
LEFT JOIN [__mj].AIAgent a ON a.ID = f.AgentID
WHERE f.IsCompleted = 1
  AND f.DayBucket >= {{ start | sqlDate }}
  AND f.DayBucket < {{ end | sqlDate }}
GROUP BY
    f.DayBucket,
    f.AgentID,
    a.TypeID,
    f.PromptID,
    f.ModelID,
    f.VendorID,
    f.UserID,
    f.PrimaryScopeEntityID,
    f.PrimaryScopeRecordID,
    f.ConfigurationID,
    f.SourceKind

