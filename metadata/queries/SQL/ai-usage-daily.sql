-- Daily AI usage, one row per UTC day x dimension set x currency. Live-only.
--
-- WINDOW — WHOLE BUCKETS: a day is returned, complete, when it overlaps [start, end). The bounds are
-- rounded OUTWARD to UTC midnight on the parameter side (start down, end up) and compared with the
-- base RunAt column, so the predicate is a range seek on IX_AIPromptRun_RunAt and every run of a
-- returned day is inside it. Comparing the DATE-typed DayBucket instead converted the timestamp
-- parameter to DATE, so `DayBucket < end` with end = now excluded TODAY. With aligned bounds the
-- result is exactly [start, end). Both parameters are optional, like the other AI usage queries.
-- The 1900-01-01 base is DATETIME2 on purpose — see ai-usage-hourly.sql.
--
-- THE BUCKET IS DERIVED FROM RunAt HERE, by truncation, with the same expression as the window
-- predicate, so a returned bucket and the runs filtered into it can never disagree.
--
-- PERCENTILES: see ai-usage-hourly.sql — window PERCENTILE_CONT over the full grouping key, parallel
-- parents excluded, collapsed with MAX.
SELECT
    CAST(x.BucketStartUTC AS DATE) AS DayBucket,
    x.BucketStartUTC,
    DATEADD(day, 1, x.BucketStartUTC) AS BucketEndUTC,
    x.AgentID,
    x.AgentTypeID,
    x.PromptID,
    x.ModelID,
    x.VendorID,
    x.UserID,
    x.PrimaryScopeEntityID,
    x.PrimaryScopeRecordID,
    x.ConfigurationID,
    x.SourceKind,
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
        b.BucketStartUTC,
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
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.ExecutionTimeMS) OVER (PARTITION BY
                b.BucketStartUTC, f.AgentID, a.TypeID, f.PromptID, f.ModelID, f.VendorID, f.UserID, f.PrimaryScopeEntityID,
                f.PrimaryScopeRecordID, f.ConfigurationID, f.SourceKind, f.CostCurrency, f.IsParallelParent)
        END AS LatencyP50,
        CASE WHEN f.IsParallelParent = 0 THEN
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY f.ExecutionTimeMS) OVER (PARTITION BY
                b.BucketStartUTC, f.AgentID, a.TypeID, f.PromptID, f.ModelID, f.VendorID, f.UserID, f.PrimaryScopeEntityID,
                f.PrimaryScopeRecordID, f.ConfigurationID, f.SourceKind, f.CostCurrency, f.IsParallelParent)
        END AS LatencyP95
    FROM [__mj].vwAIUsageFacts f
    LEFT JOIN [__mj].AIAgent a ON a.ID = f.AgentID
    CROSS APPLY (
        SELECT CAST(DATEADD(day,
                    DATEDIFF(day, CAST('19000101' AS DATETIME2), CAST(SWITCHOFFSET(f.RunAt, '+00:00') AS DATETIME2)),
                    CAST('19000101' AS DATETIME2)) AS DATETIME2(0)) AS BucketStartUTC
    ) b
    WHERE f.IsCompleted = 1
      {% if start %}
      AND f.RunAt >= TODATETIMEOFFSET(DATEADD(day,
              DATEDIFF(day, CAST('19000101' AS DATETIME2), CAST({{ start | sqlDate }} AS DATETIME2)),
              CAST('19000101' AS DATETIME2)), '+00:00')
      {% endif %}
      {% if end %}
      AND f.RunAt < TODATETIMEOFFSET(DATEADD(day,
              DATEDIFF(day, CAST('19000101' AS DATETIME2), DATEADD(microsecond, -1, CAST({{ end | sqlDate }} AS DATETIME2))) + 1,
              CAST('19000101' AS DATETIME2)), '+00:00')
      {% endif %}
) x
GROUP BY
    x.BucketStartUTC,
    x.AgentID,
    x.AgentTypeID,
    x.PromptID,
    x.ModelID,
    x.VendorID,
    x.UserID,
    x.PrimaryScopeEntityID,
    x.PrimaryScopeRecordID,
    x.ConfigurationID,
    x.SourceKind,
    x.CostCurrency
