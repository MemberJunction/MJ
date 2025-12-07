-- Top Accounts by Outstanding Balance Query
-- Returns top N accounts with highest outstanding invoice balances
-- Conditional query executed when aging bucket selected for drilldown
-- Supports filtering by aging bucket and configurable top N

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
{% if AgeBucket %}  {% if AgeBucket == 'Not Yet Due' %}  AND DATEDIFF(day, i.DueDate, GETDATE()) < 0
  {% elif AgeBucket == '0-30 days' %}  AND DATEDIFF(day, i.DueDate, GETDATE()) BETWEEN 0 AND 29
  {% elif AgeBucket == '30-60 days' %}  AND DATEDIFF(day, i.DueDate, GETDATE()) BETWEEN 30 AND 59
  {% elif AgeBucket == '60-90 days' %}  AND DATEDIFF(day, i.DueDate, GETDATE()) BETWEEN 60 AND 89
  {% elif AgeBucket == '90+ days' %}  AND DATEDIFF(day, i.DueDate, GETDATE()) >= 90
  {% endif %}{% endif %}{% if MinOutstanding %}  AND i.BalanceDue >= {{ MinOutstanding | sqlNumber }}
{% endif %}{% if AccountType %}  AND a.AccountType = {{ AccountType | sqlString }}
{% endif %}GROUP BY a.Name, a.AccountType
ORDER BY TotalOutstanding DESC
