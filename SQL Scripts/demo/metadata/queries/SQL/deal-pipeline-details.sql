-- Deal Pipeline Details Query
-- Returns raw deal records for drilldown from pipeline distribution charts
-- Query pair with deal-pipeline-distribution.sql (aggregation + detail pattern)
-- Eliminates need for complex buildEntityFilter() logic in components
-- Supports same filtering parameters as distribution query for consistency

SELECT
  d.ID,
  d.Name AS DealName,
  d.Stage,
  d.Amount,
  d.ExpectedRevenue,
  d.Probability,
  d.OpenDate,
  d.CloseDate AS ExpectedCloseDate,
  d.ActualCloseDate,
  d.AccountID,
  d.Account,
  a.AccountType,
  d.OwnerID,
  owner.FullName AS Owner,
  DATEDIFF(day, d.OpenDate, GETDATE()) AS DaysInStage,
  CASE
    WHEN d.ActualCloseDate IS NOT NULL
    THEN DATEDIFF(day, d.OpenDate, d.ActualCloseDate)
    ELSE NULL
  END AS DaysToClose
FROM CRM.vwDeals d
LEFT JOIN CRM.vwAccounts a ON a.ID = d.AccountID
LEFT JOIN CRM.vwContacts owner ON owner.ID = d.OwnerID
WHERE 1=1
{% if Stage %}  AND d.Stage = {{ Stage | sqlString }}
{% else %}  AND d.Stage NOT IN ('Closed Won', 'Closed Lost')
{% endif %}{% if AccountType %}  AND a.AccountType = {{ AccountType | sqlString }}
{% endif %}{% if MinAmount %}  AND d.Amount >= {{ MinAmount | sqlNumber }}
{% endif %}{% if StartDate %}  AND d.OpenDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND d.OpenDate <= {{ EndDate | sqlDate }}
{% endif %}ORDER BY d.Amount DESC, d.OpenDate DESC
