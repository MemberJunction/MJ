-- Top Accounts by Outstanding Balance Query
-- Returns top N accounts with highest outstanding invoice balances
-- Aggregates data from outstanding invoices by account
-- Note: Aging bucket filtering should be handled client-side using outstanding-invoices.sql
-- This query provides general-purpose account-level aggregation

SELECT TOP ({% if TopN %}{{ TopN | sqlNumber }}{% else %}10{% endif %})
  a.Name AS AccountName,
  a.AccountType,
  COUNT(*) AS InvoiceCount,
  SUM(i.BalanceDue) AS TotalOutstanding,
  AVG(i.BalanceDue) AS AvgOutstanding,
  AVG(DATEDIFF(day, i.DueDate, GETDATE())) AS AvgDaysOverdue,
  MAX(DATEDIFF(day, i.DueDate, GETDATE())) AS MaxDaysOverdue
FROM CRM.vwAccounts a
INNER JOIN CRM.vwInvoices i ON i.AccountID = a.ID
WHERE i.Status NOT IN ('Paid', 'Cancelled')
  AND i.BalanceDue > 0
{% if MinOutstanding %}  AND i.BalanceDue >= {{ MinOutstanding | sqlNumber }}
{% endif %}{% if AccountType %}  AND a.AccountType = {{ AccountType | sqlString }}
{% endif %}GROUP BY a.Name, a.AccountType
ORDER BY TotalOutstanding DESC
