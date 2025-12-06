-- Account Revenue by Type Query
-- Aggregates paid invoice revenue grouped by account type
-- Joins accounts and invoices to calculate revenue metrics by type
-- Returns account type summary suitable for pie/bar chart visualization

SELECT
  a.AccountType,
  COUNT(DISTINCT a.ID) AS AccountCount,
  SUM(i.TotalAmount) AS TotalRevenue,
  AVG(i.TotalAmount) AS AvgInvoice,
  COUNT(i.ID) AS InvoiceCount,
  SUM(i.BalanceDue) AS TotalOutstanding
FROM CRM.vwAccounts a
INNER JOIN CRM.vwInvoices i ON i.AccountID = a.ID
WHERE i.Status = 'Paid'
  AND a.IsActive = 1
{% if AccountType %}  AND a.AccountType = {{ AccountType | sqlString }}
{% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY a.AccountType
ORDER BY TotalRevenue DESC
