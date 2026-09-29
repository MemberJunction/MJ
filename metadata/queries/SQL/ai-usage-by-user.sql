-- AI usage per user (+ currency). Live-only.
--
-- Rows are model calls: parallel parents are excluded (their arms carry the work and the cost).
-- Cost is grouped by CostCurrency so two currencies are never summed into one unitless number, and
-- PricedRuns / UnpricedRuns travel beside it — an unpriced run is excluded from OwnCost, not zero.
-- The window filters the base RunAt column (range-seekable on IX_AIPromptRun_RunAt).
SELECT
    UserID,
    CostCurrency,
    COUNT(*) AS Runs,
    SUM(CASE WHEN IsPriced = 1 THEN 1 ELSE 0 END) AS PricedRuns,
    SUM(CASE WHEN IsPriced = 0 THEN 1 ELSE 0 END) AS UnpricedRuns,
    SUM(CASE WHEN IsPriced = 1 THEN OwnCost ELSE 0 END) AS OwnCost,
    SUM(TokensPrompt) AS TokensPrompt,
    SUM(TokensCompletion) AS TokensCompletion,
    MAX(RunAtUTC) AS LastRunAt
FROM [__mj].vwAIUsageFacts
WHERE IsCompleted = 1
  AND IsParallelParent = 0
  {% if start %}
  AND RunAt >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND RunAt < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    UserID,
    CostCurrency
