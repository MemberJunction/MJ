-- Deal Stage Trends Query
-- Weekly counts of deals currently in selected stage, grouped by week of OpenDate
-- Shows when deals that are NOW in this stage were originally opened
-- Useful for understanding pipeline flow: "Of all deals in Qualification, when did they open?"
-- Returns time-series data suitable for line chart visualization
-- NOTE: Stage parameter is REQUIRED for meaningful results

SELECT
  DATEADD(week, DATEDIFF(week, 0, d.OpenDate), 0) AS Date,
  COUNT(*) AS DealsEntered,
  SUM(d.Amount) AS ValueEntered,
  AVG(d.Amount) AS AvgDealSize,
  AVG(d.Probability) AS AvgProbability
FROM CRM.vwDeals d
WHERE d.Stage = {{ Stage | sqlString }}
{% if AccountType %}  AND d.AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType = {{ AccountType | sqlString }})
{% endif %}{% if MinAmount %}  AND d.Amount >= {{ MinAmount | sqlNumber }}
{% endif %}{% if StartDate %}  AND d.OpenDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND d.OpenDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY DATEADD(week, DATEDIFF(week, 0, d.OpenDate), 0)
ORDER BY Date ASC
