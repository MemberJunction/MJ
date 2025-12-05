-- AI Model Cost Analysis by Vendor Query
-- Aggregates estimated costs grouped by AI vendor
-- Calculates costs based on token usage and model cost rates
-- Returns vendor cost totals suitable for bar chart visualization

SELECT
  pr.Vendor AS VendorName,
  COUNT(*) AS RunCount,
  SUM(ISNULL(pr.TokensPrompt, 0)) AS TotalInputTokens,
  SUM(ISNULL(pr.TokensCompletion, 0)) AS TotalOutputTokens,
  SUM(ISNULL(pr.TokensUsed, 0)) AS TotalTokens,
  -- Estimated cost calculation (this is a placeholder - actual cost calculation would join to AIModelCosts)
  SUM(ISNULL(pr.TokensUsed, 0)) / 1000000.0 AS EstimatedCostUSD
FROM __mj.vwAIPromptRuns pr
WHERE pr.Success = 1
{% if StartDate %}  AND pr.RunAt >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND pr.RunAt <= {{ EndDate | sqlDate }}
{% endif %}{% if VendorName %}  AND pr.Vendor = {{ VendorName | sqlString }}
{% endif %}GROUP BY pr.Vendor
ORDER BY TotalTokens DESC
