-- PostgreSQL variant: AI usage per user (+ currency). Live-only.
-- Mirrors ai-usage-by-user.sql. Differences:
--   * `[__mj].vwAIUsageFacts` → `__mj."vwAIUsageFacts"`; column references double-quoted, since PG folds
--     unquoted names to lower case.
SELECT
    "UserID",
    "CostCurrency",
    COUNT(*) AS "Runs",
    SUM(CASE WHEN "IsPriced" = 1 THEN 1 ELSE 0 END) AS "PricedRuns",
    SUM(CASE WHEN "IsPriced" = 0 THEN 1 ELSE 0 END) AS "UnpricedRuns",
    SUM(CASE WHEN "IsPriced" = 1 THEN "OwnCost" ELSE 0 END) AS "OwnCost",
    SUM("TokensPrompt") AS "TokensPrompt",
    SUM("TokensCompletion") AS "TokensCompletion",
    MAX("RunAtUTC") AS "LastRunAt"
FROM __mj."vwAIUsageFacts"
WHERE "IsCompleted" = 1
  AND "IsParallelParent" = 0
  {% if start %}
  AND "RunAt" >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND "RunAt" < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    "UserID",
    "CostCurrency"
