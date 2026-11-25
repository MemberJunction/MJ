-- PostgreSQL variant: AI usage per vendor + model (+ currency). Live-only.
-- Mirrors ai-usage-by-model.sql. Differences:
--   * `[__mj].vwAIUsageFacts` → `__mj."vwAIUsageFacts"`; column references double-quoted, since PG folds
--     unquoted names to lower case.
--   * PERCENTILE_CONT is an ordered-set aggregate in PG, not a window function, so the percentiles are
--     computed directly per group instead of as a window collapsed with MAX. Same values: the SQL Server
--     window is partitioned by exactly the grouping key.
SELECT
    f."VendorID",
    f."ModelID",
    f."CostCurrency",
    COUNT(*) AS "Runs",
    SUM(CASE WHEN f."IsPriced" = 1 THEN 1 ELSE 0 END) AS "PricedRuns",
    SUM(CASE WHEN f."IsPriced" = 0 THEN 1 ELSE 0 END) AS "UnpricedRuns",
    SUM(CASE WHEN f."IsPriced" = 1 THEN f."OwnCost" ELSE 0 END) AS "OwnCost",
    SUM(f."TokensPrompt") AS "TokensPrompt",
    SUM(f."TokensCompletion") AS "TokensCompletion",
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY f."ExecutionTimeMS") AS "LatencyP50",
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY f."ExecutionTimeMS") AS "LatencyP95",
    -- COALESCE on BOTH addends: a + b is NULL when either is, which would drop the row from the
    -- denominator while the numerator still counts it — a ratio above 100%, then an overflow.
    CAST(
        SUM(COALESCE(f."TokensCacheRead", 0)) * 100.0
        / NULLIF(SUM(COALESCE(f."TokensPrompt", 0) + COALESCE(f."TokensCacheRead", 0)), 0)
    AS DECIMAL(5, 2)) AS "CacheEfficiencyPct"
FROM __mj."vwAIUsageFacts" f
WHERE f."IsCompleted" = 1
  AND f."IsParallelParent" = 0
  {% if start %}
  AND f."RunAt" >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND f."RunAt" < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    f."VendorID",
    f."ModelID",
    f."CostCurrency"
