-- Deal Velocity Analysis Query
-- Analyzes how quickly deals move through the pipeline by stage
-- Calculates average days in each stage for closed deals
-- Returns stage velocity metrics suitable for heatmap visualization

SELECT
  d.Stage,
  COUNT(*) AS DealCount,
  AVG(CASE
    WHEN d.ActualCloseDate IS NOT NULL
    THEN DATEDIFF(day, d.OpenDate, d.ActualCloseDate)
    ELSE DATEDIFF(day, d.OpenDate, GETDATE())
  END) AS AvgDaysToClose,
  AVG(CASE
    WHEN d.ActualCloseDate IS NOT NULL
    THEN DATEDIFF(day, d.OpenDate, d.ActualCloseDate)
    ELSE DATEDIFF(day, d.OpenDate, GETDATE())
  END) AS AvgDaysInPipeline,
  SUM(CASE WHEN d.ActualCloseDate IS NOT NULL AND d.Stage = 'Closed Won' THEN 1 ELSE 0 END) AS WonCount,
  SUM(CASE WHEN d.ActualCloseDate IS NOT NULL AND d.Stage = 'Closed Lost' THEN 1 ELSE 0 END) AS LostCount,
  CAST(SUM(CASE WHEN d.ActualCloseDate IS NOT NULL AND d.Stage = 'Closed Won' THEN 1 ELSE 0 END) * 100.0 /
    NULLIF(SUM(CASE WHEN d.ActualCloseDate IS NOT NULL THEN 1 ELSE 0 END), 0) AS DECIMAL(5,2)) AS WinRate
FROM CRM.vwDeals d
WHERE d.OpenDate >= DATEADD(month, -{% if MonthsBack %}{{ MonthsBack | sqlNumber }}{% else %}6{% endif %}, GETDATE())
{% if Stage %}  AND d.Stage = {{ Stage | sqlString }}
{% endif %}{% if AccountType %}  AND d.AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType = {{ AccountType | sqlString }})
{% endif %}{% if StartDate %}  AND d.OpenDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND d.OpenDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY d.Stage
ORDER BY AvgDaysInPipeline DESC 
