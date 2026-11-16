-- PostgreSQL variant: provider cache effectiveness per model + prompt (+ currency), and what those
-- cache reads saved. Live-only. The pricing rules are documented in ai-usage-cache-efficiency.sql.
-- Mirrors ai-usage-cache-efficiency.sql. Differences:
--   * `[__mj].X` → `__mj."X"`; column references double-quoted, since PG folds unquoted names to lower
--     case.
--   * `OUTER APPLY (SELECT TOP 1 … ORDER BY StartedAt DESC)` → `LEFT JOIN LATERAL (… LIMIT 1) ON true`,
--     ordered `DESC NULLS LAST`: SQL Server sorts NULL lowest, so its DESC puts a NULL StartedAt last,
--     while PG's DESC puts it first.
SELECT
    f."ModelID",
    f."PromptID",
    f."CostCurrency",
    COUNT(*) AS "Runs",
    SUM(COALESCE(f."TokensCacheRead", 0)) AS "TokensCacheRead",
    SUM(COALESCE(f."TokensPrompt", 0)) AS "TokensPrompt",
    -- COALESCE on BOTH addends: a + b is NULL when either is, which would drop the row from the
    -- denominator while the numerator still counts it — a ratio above 1, then an overflow.
    CAST(
        SUM(COALESCE(f."TokensCacheRead", 0)) * 1.0
        / NULLIF(SUM(COALESCE(f."TokensPrompt", 0) + COALESCE(f."TokensCacheRead", 0)), 0)
    AS DECIMAL(5, 4)) AS "CacheReadShare",
    SUM(
        CASE WHEN c."CacheReadPricePerUnit" IS NOT NULL THEN
            CAST(COALESCE(f."TokensCacheRead", 0) AS DECIMAL(19, 8))
            * (c."InputPricePerUnit" - c."CacheReadPricePerUnit")
            / c."UnitsPerBillingUnit"
        END
    ) AS "EstimatedSavings",
    SUM(CASE WHEN COALESCE(f."TokensCacheRead", 0) > 0 AND c."CacheReadPricePerUnit" IS NOT NULL THEN 1 ELSE 0 END) AS "RatedRuns",
    SUM(CASE WHEN COALESCE(f."TokensCacheRead", 0) > 0 AND c."CacheReadPricePerUnit" IS NULL THEN 1 ELSE 0 END) AS "UnratedRuns",
    SUM(CASE WHEN c."CacheReadPricePerUnit" IS NULL THEN COALESCE(f."TokensCacheRead", 0) ELSE 0 END) AS "UnratedTokensCacheRead"
FROM __mj."vwAIUsageFacts" f
LEFT JOIN LATERAL (
    SELECT mc."InputPricePerUnit", mc."CacheReadPricePerUnit", put."UnitsPerBillingUnit"
    FROM __mj."AIModelCost" mc
    JOIN __mj."AIModelPriceUnitType" put ON put."ID" = mc."UnitTypeID"
    JOIN __mj."AIUsageType" ut ON ut."ID" = put."UsageTypeID"
    WHERE mc."ModelID" = f."ModelID"
      AND mc."VendorID" = f."VendorID"
      AND mc."Currency" = f."CostCurrency"
      AND mc."ProcessingType" = 'Realtime'
      AND mc."Status" IN ('Active', 'Expired')
      AND ut."Name" = 'Tokens'
      AND put."UnitsPerBillingUnit" > 0
      AND (mc."StartedAt" IS NULL OR mc."StartedAt" <= f."RunAt")
      AND (mc."EndedAt" IS NULL OR mc."EndedAt" > f."RunAt")
    ORDER BY mc."StartedAt" DESC NULLS LAST
    LIMIT 1
) c ON true
WHERE f."IsCompleted" = 1
  AND f."IsParallelParent" = 0
  {% if start %}
  AND f."RunAt" >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND f."RunAt" < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    f."ModelID",
    f."PromptID",
    f."CostCurrency"
