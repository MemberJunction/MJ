-- Provider cache effectiveness per model + prompt, and what those cache reads saved.
--
-- THE DIVISOR IS DATA, NOT A LITERAL. An earlier revision divided by a hardcoded 1000000.0, which
-- is right only while every seeded rate happens to be per-1M-tokens and reports savings 1000x too
-- high the day someone seeds a per-1K row. AIModelPriceUnitType.UnitsPerBillingUnit exists for
-- exactly this ("1000000 for a per-1M-tokens rate, 3600 for per-hour…"), and holding it in code is
-- the shape of defect that let six ACTIVE image cost rows price nothing for months.
--
-- The rate is matched on MODEL **AND VENDOR**: a model served by several vendors has several active
-- rate rows, and picking an arbitrary one prices one vendor's traffic at another's rate. Rows are
-- grouped by currency so a multi-currency estimate is never silently summed into one number.
SELECT
    f.ModelID,
    f.PromptID,
    f.CostCurrency,
    SUM(CASE WHEN f.IsParallelParent = 0 THEN COALESCE(f.TokensCacheRead, 0) ELSE 0 END) AS TokensCacheRead,
    SUM(CASE WHEN f.IsParallelParent = 0 THEN COALESCE(f.TokensPrompt, 0) ELSE 0 END) AS TokensPrompt,
    -- COALESCE on BOTH addends: they are nullable ints, and `a + b` is NULL if either is, which
    -- drops the whole row from the denominator while the numerator still counts it — a ratio > 1,
    -- and an arithmetic-overflow error once it passes the DECIMAL ceiling.
    CAST(
        SUM(CASE WHEN f.IsParallelParent = 0 THEN COALESCE(f.TokensCacheRead, 0) ELSE 0 END) * 1.0
        / NULLIF(SUM(CASE WHEN f.IsParallelParent = 0 THEN COALESCE(f.TokensPrompt, 0) + COALESCE(f.TokensCacheRead, 0) ELSE 0 END), 0)
    AS DECIMAL(5, 4)) AS CacheReadShare,
    SUM(
        CAST(CASE WHEN f.IsParallelParent = 0 THEN COALESCE(f.TokensCacheRead, 0) ELSE 0 END AS DECIMAL(19, 8))
        * (COALESCE(c.InputPricePerUnit, 0) - COALESCE(c.CacheReadPricePerUnit, 0))
        / NULLIF(c.UnitsPerBillingUnit, 0)
    ) AS EstimatedSavings
FROM [__mj].vwAIUsageFacts f
OUTER APPLY (
    SELECT TOP 1 mc.InputPricePerUnit, mc.CacheReadPricePerUnit, put.UnitsPerBillingUnit
    FROM [__mj].vwAIModelCosts mc
    JOIN [__mj].vwAIModelPriceUnitTypes put ON put.ID = mc.UnitTypeID
    WHERE mc.ModelID = f.ModelID
      AND mc.VendorID = f.VendorID
      AND mc.Status = 'Active'
      AND mc.Currency = f.CostCurrency
      -- Token-billed rates only; an image or per-minute row must never price a token run.
      AND put.UnitsPerBillingUnit IS NOT NULL
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
    f.PromptID,
    f.CostCurrency
