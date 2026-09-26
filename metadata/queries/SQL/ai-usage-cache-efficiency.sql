-- Provider cache effectiveness per model + prompt (+ currency), and what those cache reads saved.
-- Live-only.
--
-- THE RATE IS THE ONE IN EFFECT AT RunAt. Cost is frozen at save time, so a savings estimate must
-- price each run at the rate that applied when it ran: StartedAt <= RunAt < EndedAt, including a row
-- that has since been Expired. Picking the most recently started Active row instead let a June price
-- cut rewrite January's savings, and let a future-dated row win.
--
-- TOKEN-BILLED RATES ONLY, BY MEASURE. The unit type's UsageTypeID names what a rate is a quantity of
-- (Tokens / Seconds / Images / Characters) and is the authority for it — AIModelCost deliberately
-- carries no copy. Filtering on UnitsPerBillingUnit IS NOT NULL did not do this: a per-image row
-- (UnitsPerBillingUnit = 1) passed, and priced cache-read tokens at $0.04 each. Matching is on MODEL
-- AND VENDOR AND CURRENCY, Realtime processing (what the runtime prices interactive runs with).
--
-- THE DIVISOR IS DATA: AIModelPriceUnitType.UnitsPerBillingUnit, never a hardcoded 1000000.
--
-- UNKNOWN IS NOT FREE. A NULL CacheReadPricePerUnit means no cache rate is recorded — the runtime then
-- billed those reads at the full input rate, so the recorded cost holds no saving and the real saving
-- is unknown. Such runs, and runs whose model has no token rate in effect at all, are excluded from
-- EstimatedSavings and counted in UnratedRuns / UnratedTokensCacheRead beside it. EstimatedSavings is
-- NULL when nothing in the group could be rated.
SELECT
    f.ModelID,
    f.PromptID,
    f.CostCurrency,
    COUNT(*) AS Runs,
    SUM(COALESCE(f.TokensCacheRead, 0)) AS TokensCacheRead,
    SUM(COALESCE(f.TokensPrompt, 0)) AS TokensPrompt,
    -- COALESCE on BOTH addends: a + b is NULL when either is, which would drop the row from the
    -- denominator while the numerator still counts it — a ratio above 1, then an overflow.
    CAST(
        SUM(COALESCE(f.TokensCacheRead, 0)) * 1.0
        / NULLIF(SUM(COALESCE(f.TokensPrompt, 0) + COALESCE(f.TokensCacheRead, 0)), 0)
    AS DECIMAL(5, 4)) AS CacheReadShare,
    SUM(
        CASE WHEN c.CacheReadPricePerUnit IS NOT NULL THEN
            CAST(COALESCE(f.TokensCacheRead, 0) AS DECIMAL(19, 8))
            * (c.InputPricePerUnit - c.CacheReadPricePerUnit)
            / c.UnitsPerBillingUnit
        END
    ) AS EstimatedSavings,
    SUM(CASE WHEN COALESCE(f.TokensCacheRead, 0) > 0 AND c.CacheReadPricePerUnit IS NOT NULL THEN 1 ELSE 0 END) AS RatedRuns,
    SUM(CASE WHEN COALESCE(f.TokensCacheRead, 0) > 0 AND c.CacheReadPricePerUnit IS NULL THEN 1 ELSE 0 END) AS UnratedRuns,
    SUM(CASE WHEN c.CacheReadPricePerUnit IS NULL THEN COALESCE(f.TokensCacheRead, 0) ELSE 0 END) AS UnratedTokensCacheRead
FROM [__mj].vwAIUsageFacts f
OUTER APPLY (
    SELECT TOP 1 mc.InputPricePerUnit, mc.CacheReadPricePerUnit, put.UnitsPerBillingUnit
    FROM [__mj].AIModelCost mc
    JOIN [__mj].AIModelPriceUnitType put ON put.ID = mc.UnitTypeID
    JOIN [__mj].AIUsageType ut ON ut.ID = put.UsageTypeID
    WHERE mc.ModelID = f.ModelID
      AND mc.VendorID = f.VendorID
      AND mc.Currency = f.CostCurrency
      AND mc.ProcessingType = 'Realtime'
      AND mc.Status IN ('Active', 'Expired')
      AND ut.Name = 'Tokens'
      AND put.UnitsPerBillingUnit > 0
      AND (mc.StartedAt IS NULL OR mc.StartedAt <= f.RunAt)
      AND (mc.EndedAt IS NULL OR mc.EndedAt > f.RunAt)
    ORDER BY mc.StartedAt DESC
) c
WHERE f.IsCompleted = 1
  AND f.IsParallelParent = 0
  {% if start %}
  AND f.RunAt >= {{ start | sqlDate }}
  {% endif %}
  {% if end %}
  AND f.RunAt < {{ end | sqlDate }}
  {% endif %}
GROUP BY
    f.ModelID,
    f.PromptID,
    f.CostCurrency
