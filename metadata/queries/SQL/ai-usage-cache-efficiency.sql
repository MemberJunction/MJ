SELECT
    f.ModelID,
    f.PromptID,
    SUM(CASE WHEN f.IsParallelParent = 0 THEN f.TokensCacheRead ELSE 0 END) AS TokensCacheRead,
    SUM(CASE WHEN f.IsParallelParent = 0 THEN f.TokensPrompt ELSE 0 END) AS TokensPrompt,
    CAST(SUM(CASE WHEN f.IsParallelParent = 0 THEN f.TokensCacheRead ELSE 0 END) * 1.0 / NULLIF(SUM(CASE WHEN f.IsParallelParent = 0 THEN f.TokensPrompt + f.TokensCacheRead ELSE 0 END), 0) AS DECIMAL(5, 4)) AS CacheReadShare,
    SUM(CAST(CASE WHEN f.IsParallelParent = 0 THEN f.TokensCacheRead ELSE 0 END AS DECIMAL(18, 4)) * (COALESCE(c.InputPricePerUnit, 0) - COALESCE(c.CacheReadPricePerUnit, 0)) / 1000000.0) AS EstimatedSavings
FROM [__mj].vwAIUsageFacts f
OUTER APPLY (
    SELECT TOP 1 mc.InputPricePerUnit, mc.CacheReadPricePerUnit
    FROM [__mj].vwAIModelCosts mc
    WHERE mc.ModelID = f.ModelID AND mc.Status = 'Active'
    ORDER BY mc.StartedAt DESC
) c
WHERE f.IsCompleted = 1
  {% if start %}
  AND f.RunAtUTC >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND f.RunAtUTC < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    f.ModelID,
    f.PromptID
