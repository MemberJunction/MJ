-- PostgreSQL variant: AI usage per primary scope (+ currency). Live-only.
-- Mirrors ai-usage-by-scope.sql. Differences:
--   * `[__mj].vwAIUsageFacts` → `__mj."vwAIUsageFacts"`; column references double-quoted, since PG folds
--     unquoted names to lower case.
--   * `Success` is a boolean in PG, so it is compared with true / false rather than 1 / 0.
--   * PERCENTILE_CONT is an ordered-set aggregate in PG, not a window function. The percentiles are
--     computed per group over the non-parallel rows (a CASE yields NULL for a parallel parent, and
--     PERCENTILE_CONT skips NULLs), which is what the SQL Server window over the grouping key plus
--     IsParallelParent, collapsed with MAX, returns.
--   * `TRY_CONVERT(uniqueidentifier, …)` has no PG equivalent; the scope entity ID is compared as text,
--     lower-cased, so a value that is not a UUID matches nothing, as it does on SQL Server.
SELECT
    f."PrimaryScopeEntityID",
    f."PrimaryScopeRecordID",
    f."CostCurrency",
    SUM(CASE WHEN f."IsParallelParent" = 0 THEN 1 ELSE 0 END) AS "Runs",
    SUM(CASE WHEN f."IsParallelParent" = 0 AND f."Success" = true THEN 1 ELSE 0 END) AS "SucceededRuns",
    SUM(CASE WHEN f."IsParallelParent" = 0 AND f."Success" = false THEN 1 ELSE 0 END) AS "FailedRuns",
    SUM(CASE WHEN f."IsParallelParent" = 0 AND f."IsPriced" = 1 THEN 1 ELSE 0 END) AS "PricedRuns",
    SUM(CASE WHEN f."IsParallelParent" = 0 AND f."IsPriced" = 0 THEN 1 ELSE 0 END) AS "UnpricedRuns",
    SUM(CASE WHEN f."IsParallelParent" = 0 AND f."IsUnmeasured" = 1 THEN 1 ELSE 0 END) AS "UnmeasuredRuns",
    SUM(CASE WHEN f."IsParallelParent" = 1 THEN 1 ELSE 0 END) AS "ParallelParents",
    SUM(CASE WHEN f."IsParallelParent" = 0 THEN f."TokensPrompt" ELSE 0 END) AS "TokensPrompt",
    SUM(CASE WHEN f."IsParallelParent" = 0 THEN f."TokensCompletion" ELSE 0 END) AS "TokensCompletion",
    SUM(CASE WHEN f."IsParallelParent" = 0 THEN f."TokensCacheRead" ELSE 0 END) AS "TokensCacheRead",
    SUM(CASE WHEN f."IsParallelParent" = 0 THEN f."TokensCacheWrite" ELSE 0 END) AS "TokensCacheWrite",
    SUM(CASE WHEN f."IsParallelParent" = 0 AND f."IsPriced" = 1 THEN f."OwnCost" ELSE 0 END) AS "OwnCost",
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN f."IsParallelParent" = 0 THEN f."ExecutionTimeMS" END) AS "LatencyP50",
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY CASE WHEN f."IsParallelParent" = 0 THEN f."ExecutionTimeMS" END) AS "LatencyP95",
    AVG(CASE WHEN f."IsParallelParent" = 0 THEN f."FirstTokenTime" END) AS "AvgFirstTokenMS"
FROM __mj."vwAIUsageFacts" f
WHERE f."IsCompleted" = 1
  {% if scopeEntityId %}
  AND CAST(f."PrimaryScopeEntityID" AS TEXT) = LOWER({{ scopeEntityId | sqlString }})
  {% endif %}
  {% if scopeRecordId %}
  AND f."PrimaryScopeRecordID" = {{ scopeRecordId | sqlString }}
  {% endif %}
  {% if start %}
  AND f."RunAt" >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND f."RunAt" < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    f."PrimaryScopeEntityID",
    f."PrimaryScopeRecordID",
    f."CostCurrency"
