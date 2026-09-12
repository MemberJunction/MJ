SELECT
    f.ModelID,
    f.PromptID,
    SUM(f.TokensCacheRead) AS TokensCacheRead,
    SUM(f.TokensPrompt) AS TokensPrompt,
    CAST(SUM(f.TokensCacheRead) * 1.0 / NULLIF(SUM(f.TokensPrompt + f.TokensCacheRead), 0) AS DECIMAL(5, 4)) AS CacheReadShare,
    SUM(CAST(f.TokensCacheRead AS DECIMAL(18, 4)) * (COALESCE(c.InputPricePerUnit, 0) - COALESCE(c.CacheReadPricePerUnit, 0)) / 1000000.0) AS EstimatedSavings
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
