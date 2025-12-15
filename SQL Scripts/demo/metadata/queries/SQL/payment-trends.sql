-- Payment Trends Query
-- Monthly payment totals with average days from invoice to payment
-- Analyzes payment velocity and cash collection patterns over time
-- Returns time-series data suitable for dual-axis line chart visualization

SELECT
  YEAR(p.PaymentDate) AS Year,
  MONTH(p.PaymentDate) AS Month,
  DATENAME(month, p.PaymentDate) AS MonthName,
  COUNT(*) AS PaymentCount,
  SUM(p.Amount) AS TotalPaid,
  AVG(p.Amount) AS AvgPayment,
  AVG(DATEDIFF(day, i.InvoiceDate, p.PaymentDate)) AS AvgDaysToPayment,
  COUNT(DISTINCT i.AccountID) AS UniqueAccounts
FROM CRM.vwPayments p
INNER JOIN CRM.vwInvoices i ON i.ID = p.InvoiceID
WHERE p.PaymentDate >= DATEADD(month, -{% if MonthsBack %}{{ MonthsBack | sqlNumber }}{% else %}12{% endif %}, GETDATE())
{% if PaymentMethod %}  AND p.PaymentMethod = {{ PaymentMethod | sqlString }}
{% endif %}{% if AccountType %}  AND i.AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType = {{ AccountType | sqlString }})
{% endif %}GROUP BY YEAR(p.PaymentDate), MONTH(p.PaymentDate), DATENAME(month, p.PaymentDate)
ORDER BY Year ASC, Month ASC
