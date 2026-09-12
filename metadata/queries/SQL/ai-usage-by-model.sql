SELECT
    VendorID,
    ModelID,
    COUNT(*) AS Runs,
    SUM(CASE WHEN IsPriced = 1 AND IsParallelParent = 0 THEN OwnCost ELSE 0 END) AS OwnCost,
    SUM(TokensPrompt) AS TokensPrompt,
    SUM(TokensCompletion) AS TokensCompletion,
    APPROX_PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ExecutionTimeMS) AS LatencyP50,
    APPROX_PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ExecutionTimeMS) AS LatencyP95,
    CAST(SUM(TokensCacheRead) * 100.0 / NULLIF(SUM(TokensPrompt + TokensCacheRead), 0) AS DECIMAL(5, 2)) AS CacheEfficiencyPct
FROM [__mj].vwAIUsageFacts
WHERE IsCompleted = 1
  {% if start %}
  AND RunAtUTC >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND RunAtUTC < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    VendorID,
    ModelID
