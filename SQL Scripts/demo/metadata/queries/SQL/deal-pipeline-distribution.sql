-- Deal Pipeline Distribution Query
-- Current pipeline distribution by stage with value and count metrics
-- Aggregates active deals to show pipeline health and stage bottlenecks
-- Returns stage summary suitable for funnel chart and dashboard KPIs

SELECT
  d.Stage,
  COUNT(*) AS DealCount,
  SUM(d.Amount) AS TotalValue,
  AVG(d.Amount) AS AvgDealSize,
  SUM(d.ExpectedRevenue) AS TotalExpectedRevenue,
  AVG(d.Probability) AS AvgProbability,
  AVG(DATEDIFF(day, d.OpenDate, GETDATE())) AS AvgDaysInStage
FROM CRM.vwDeals d
WHERE 1=1
{% if Stage %}  AND d.Stage = {{ Stage | sqlString }}
{% else %}  AND d.Stage NOT IN ('Closed Won', 'Closed Lost')
{% endif %}{% if AccountType %}  AND d.AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType = {{ AccountType | sqlString }})
{% endif %}{% if MinAmount %}  AND d.Amount >= {{ MinAmount | sqlNumber }}
{% endif %}{% if StartDate %}  AND d.OpenDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND d.OpenDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY d.Stage
ORDER BY
  CASE d.Stage
    WHEN 'Prospecting' THEN 1
    WHEN 'Qualification' THEN 2
    WHEN 'Proposal' THEN 3
    WHEN 'Negotiation' THEN 4
    WHEN 'Closed Won' THEN 5
    WHEN 'Closed Lost' THEN 6
    ELSE 7
  END
