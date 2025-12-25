-- AI Model Usage Distribution Query
-- Groups AI prompt runs by model name with counts
-- Returns model distribution suitable for pie chart visualization
-- Supports optional date range and vendor filtering

SELECT
  pr.Model AS ModelName,
  COUNT(*) AS RunCount,
  COUNT(CASE WHEN pr.Success = 1 THEN 1 END) AS SuccessCount,
  COUNT(CASE WHEN pr.Success = 0 THEN 1 END) AS FailureCount,
  CAST(COUNT(CASE WHEN pr.Success = 1 THEN 1 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS SuccessRate
FROM __mj.vwAIPromptRuns pr
WHERE 1=1
{% if StartDate %}  AND pr.RunAt >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND pr.RunAt <= {{ EndDate | sqlDate }}
{% endif %}{% if VendorName %}  AND pr.Vendor = {{ VendorName | sqlString }}
{% endif %}GROUP BY pr.Model
ORDER BY RunCount DESC
