-- PostgreSQL variant: daily AI usage, one row per UTC day x dimension set x currency. Live-only.
-- The window and bucket rules are documented in ai-usage-daily.sql.
-- Mirrors ai-usage-daily.sql. Differences:
--   * `[__mj].X` → `__mj."X"`; column references double-quoted, since PG folds unquoted names to lower
--     case.
--   * The UTC day is `date_trunc('day', RunAt AT TIME ZONE 'UTC')` (a timestamp without time zone, like
--     SQL Server's DATETIME2(0) bucket), computed in a LATERAL subquery in place of CROSS APPLY. The
--     window bounds are rounded outward the same way (start down, end - 1 microsecond up) and turned
--     back into UTC instants with `AT TIME ZONE 'UTC'` before they are compared with RunAt.
--   * `Success` is a boolean in PG, so it is compared with true / false rather than 1 / 0.
--   * PERCENTILE_CONT is an ordered-set aggregate in PG, not a window function. The percentiles are
--     computed per group over the non-parallel rows (a CASE yields NULL for a parallel parent, and
--     PERCENTILE_CONT skips NULLs), which is what the SQL Server window, collapsed with MAX, returns.
SELECT
    CAST(b."BucketStartUTC" AS DATE) AS "DayBucket",
    b."BucketStartUTC",
    b."BucketStartUTC" + INTERVAL '1 day' AS "BucketEndUTC",
    f."AgentID",
    a."TypeID" AS "AgentTypeID",
    f."PromptID",
    f."ModelID",
    f."VendorID",
    f."UserID",
    f."PrimaryScopeEntityID",
    f."PrimaryScopeRecordID",
    f."ConfigurationID",
    f."SourceKind",
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
LEFT JOIN __mj."AIAgent" a ON a."ID" = f."AgentID"
CROSS JOIN LATERAL (
    SELECT date_trunc('day', f."RunAt" AT TIME ZONE 'UTC') AS "BucketStartUTC"
) b
WHERE f."IsCompleted" = 1
  {% if start %}
  AND f."RunAt" >= date_trunc('day', CAST({{ start | sqlDate }} AS TIMESTAMPTZ) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  {% endif %}
  {% if end %}
  AND f."RunAt" < (date_trunc('day', (CAST({{ end | sqlDate }} AS TIMESTAMPTZ) AT TIME ZONE 'UTC') - INTERVAL '1 microsecond')
                   + INTERVAL '1 day') AT TIME ZONE 'UTC'
  {% endif %}
GROUP BY
    b."BucketStartUTC",
    f."AgentID",
    a."TypeID",
    f."PromptID",
    f."ModelID",
    f."VendorID",
    f."UserID",
    f."PrimaryScopeEntityID",
    f."PrimaryScopeRecordID",
    f."ConfigurationID",
    f."SourceKind",
    f."CostCurrency"
