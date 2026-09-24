-- AI usage per vendor + model (+ currency). Live-only.
--
-- Rows are model calls: parallel parents are excluded up front, because a parent carries a ModelID
-- for a model it never invoked and an ExecutionTimeMS that spans its whole fan-out.
-- Cost is grouped by CostCurrency so two currencies are never summed into one unitless number, and
-- PricedRuns / UnpricedRuns travel beside it — an unpriced run is excluded from OwnCost, not zero.
-- The window filters the base RunAt column (range-seekable on IX_AIPromptRun_RunAt), not a derived
-- UTC bucket expression; SWITCHOFFSET is order-preserving, so the rows are identical.
-- Percentiles are PERCENTILE_CONT window functions (SQL Server 2019), collapsed with MAX.
SELECT
    x.VendorID,
    x.ModelID,
    x.CostCurrency,
    COUNT(*) AS Runs,
    SUM(CASE WHEN x.IsPriced = 1 THEN 1 ELSE 0 END) AS PricedRuns,
    SUM(CASE WHEN x.IsPriced = 0 THEN 1 ELSE 0 END) AS UnpricedRuns,
    SUM(CASE WHEN x.IsPriced = 1 THEN x.OwnCost ELSE 0 END) AS OwnCost,
    SUM(x.TokensPrompt) AS TokensPrompt,
    SUM(x.TokensCompletion) AS TokensCompletion,
    MAX(x.LatencyP50) AS LatencyP50,
    MAX(x.LatencyP95) AS LatencyP95,
    -- COALESCE on BOTH addends: a + b is NULL when either is, which would drop the row from the
    -- denominator while the numerator still counts it — a ratio above 100%, then an overflow.
    CAST(
        SUM(COALESCE(x.TokensCacheRead, 0)) * 100.0
        / NULLIF(SUM(COALESCE(x.TokensPrompt, 0) + COALESCE(x.TokensCacheRead, 0)), 0)
    AS DECIMAL(5, 2)) AS CacheEfficiencyPct
FROM (
    SELECT
        f.VendorID,
        f.ModelID,
        f.CostCurrency,
        f.IsPriced,
        f.OwnCost,
        f.TokensPrompt,
        f.TokensCompletion,
        f.TokensCacheRead,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f.ExecutionTimeMS)
            OVER (PARTITION BY f.VendorID, f.ModelID, f.CostCurrency) AS LatencyP50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY f.ExecutionTimeMS)
            OVER (PARTITION BY f.VendorID, f.ModelID, f.CostCurrency) AS LatencyP95
    FROM [__mj].vwAIUsageFacts f
    WHERE f.IsCompleted = 1
      AND f.IsParallelParent = 0
      {% if start %}
      AND f.RunAt >= {{ start | sqlDate }}
      {% endif %}
      {% if end %}
      AND f.RunAt < {{ end | sqlDate }}
      {% endif %}
) x
GROUP BY
    x.VendorID,
    x.ModelID,
    x.CostCurrency
