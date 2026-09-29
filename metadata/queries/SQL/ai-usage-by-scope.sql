-- AI usage per tenant scope (PrimaryScopeEntityID + PrimaryScopeRecordID, + currency). Live-only.
--
-- Runs and every measure count model calls only; parallel parents are counted separately in
-- ParallelParents, because a parent's ExecutionTimeMS spans its whole fan-out and it carries no
-- own cost. Cost is grouped by CostCurrency, with PricedRuns / UnpricedRuns beside it.
-- The window filters the base RunAt column (range-seekable on IX_AIPromptRun_RunAt).
-- Percentiles are PERCENTILE_CONT window functions (SQL Server 2019), parents nulled out,
-- collapsed with MAX.
SELECT
    x.PrimaryScopeEntityID,
    x.PrimaryScopeRecordID,
    x.CostCurrency,
    SUM(CASE WHEN x.IsParallelParent = 0 THEN 1 ELSE 0 END) AS Runs,
    SUM(CASE WHEN x.IsParallelParent = 0 AND x.Success = 1 THEN 1 ELSE 0 END) AS SucceededRuns,
    SUM(CASE WHEN x.IsParallelParent = 0 AND x.Success = 0 THEN 1 ELSE 0 END) AS FailedRuns,
    SUM(CASE WHEN x.IsParallelParent = 0 AND x.IsPriced = 1 THEN 1 ELSE 0 END) AS PricedRuns,
    SUM(CASE WHEN x.IsParallelParent = 0 AND x.IsPriced = 0 THEN 1 ELSE 0 END) AS UnpricedRuns,
    SUM(CASE WHEN x.IsParallelParent = 0 AND x.IsUnmeasured = 1 THEN 1 ELSE 0 END) AS UnmeasuredRuns,
    SUM(CASE WHEN x.IsParallelParent = 1 THEN 1 ELSE 0 END) AS ParallelParents,
    SUM(CASE WHEN x.IsParallelParent = 0 THEN x.TokensPrompt ELSE 0 END) AS TokensPrompt,
    SUM(CASE WHEN x.IsParallelParent = 0 THEN x.TokensCompletion ELSE 0 END) AS TokensCompletion,
    SUM(CASE WHEN x.IsParallelParent = 0 THEN x.TokensCacheRead ELSE 0 END) AS TokensCacheRead,
    SUM(CASE WHEN x.IsParallelParent = 0 THEN x.TokensCacheWrite ELSE 0 END) AS TokensCacheWrite,
    SUM(CASE WHEN x.IsParallelParent = 0 AND x.IsPriced = 1 THEN x.OwnCost ELSE 0 END) AS OwnCost,
    MAX(x.LatencyP50) AS LatencyP50,
    MAX(x.LatencyP95) AS LatencyP95,
    AVG(CASE WHEN x.IsParallelParent = 0 THEN x.FirstTokenTime END) AS AvgFirstTokenMS
FROM (
    SELECT
        f.PrimaryScopeEntityID,
        f.PrimaryScopeRecordID,
        f.CostCurrency,
        f.IsParallelParent,
        f.Success,
        f.IsPriced,
        f.IsUnmeasured,
        f.TokensPrompt,
        f.TokensCompletion,
        f.TokensCacheRead,
        f.TokensCacheWrite,
        f.OwnCost,
        f.FirstTokenTime,
        CASE WHEN f.IsParallelParent = 0 THEN
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.ExecutionTimeMS)
                OVER (PARTITION BY f.PrimaryScopeEntityID, f.PrimaryScopeRecordID, f.CostCurrency, f.IsParallelParent)
        END AS LatencyP50,
        CASE WHEN f.IsParallelParent = 0 THEN
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY f.ExecutionTimeMS)
                OVER (PARTITION BY f.PrimaryScopeEntityID, f.PrimaryScopeRecordID, f.CostCurrency, f.IsParallelParent)
        END AS LatencyP95
    FROM [__mj].vwAIUsageFacts f
    WHERE f.IsCompleted = 1
      {% if scopeEntityId %}
      AND f.PrimaryScopeEntityID = TRY_CONVERT(uniqueidentifier, {{ scopeEntityId | sqlString }})
      {% endif %}
      {% if scopeRecordId %}
      AND f.PrimaryScopeRecordID = {{ scopeRecordId | sqlString }}
      {% endif %}
      {% if start %}
      AND f.RunAt >= {{ start | sqlDate }}
      {% endif %}
      {% if end %}
      AND f.RunAt < {{ end | sqlDate }}
      {% endif %}
) x
GROUP BY
    x.PrimaryScopeEntityID,
    x.PrimaryScopeRecordID,
    x.CostCurrency
