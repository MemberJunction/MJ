SELECT
    UserID,
    COUNT(*) AS Runs,
    SUM(CASE WHEN IsPriced = 1 AND IsParallelParent = 0 THEN OwnCost ELSE 0 END) AS OwnCost,
    SUM(TokensPrompt) AS TokensPrompt,
    SUM(TokensCompletion) AS TokensCompletion,
    MAX(RunAtUTC) AS LastRunAt
FROM [__mj].vwAIUsageFacts
WHERE IsCompleted = 1
  {% if start %}
  AND RunAtUTC >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND RunAtUTC < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    UserID
