-- AI Model Usage Trends Query
-- Daily usage counts over configurable time period
-- Groups prompt runs by date for time-series trend analysis
-- Returns daily counts suitable for line chart visualization

SELECT
  CAST(pr.RunAt AS DATE) AS Date,
  COUNT(*) AS RunCount,
  COUNT(CASE WHEN pr.Success = 1 THEN 1 END) AS SuccessCount,
  COUNT(CASE WHEN pr.Success = 0 THEN 1 END) AS FailureCount,
  SUM(ISNULL(pr.TokensPrompt, 0)) AS TotalInputTokens,
  SUM(ISNULL(pr.TokensCompletion, 0)) AS TotalOutputTokens,
  AVG(DATEDIFF(SECOND, pr.RunAt, pr.CompletedAt)) AS AvgDurationSeconds
FROM __mj.vwAIPromptRuns pr
WHERE pr.RunAt >= DATEADD(day, -{% if DaysBack %}{{ DaysBack | sqlNumber }}{% else %}30{% endif %}, GETDATE())
{% if VendorName %}  AND pr.Vendor = {{ VendorName | sqlString }}
{% endif %}{% if ModelName %}  AND pr.Model = {{ ModelName | sqlString }}
{% endif %}GROUP BY CAST(pr.RunAt AS DATE)
ORDER BY Date ASC
