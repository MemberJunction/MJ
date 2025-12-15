-- Invoices by Account Type Query
-- Returns invoice records filtered by account type with date range support
-- Joins invoices and accounts to enable drill-down by account type
-- Used by AccountRevenueByType component for DataGrid drill-down display

SELECT
  i.ID,
  i.InvoiceNumber,
  i.InvoiceDate,
  i.DueDate,
  a.Name AS AccountName,
  a.AccountType,
  i.TotalAmount,
  i.AmountPaid,
  i.BalanceDue,
  i.Status
FROM
  CRM.vwInvoices i
  INNER JOIN CRM.vwAccounts a ON i.AccountID = a.ID
WHERE
  a.AccountType = {{ AccountType | sqlString }}
  {% if StartDate %}AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}ORDER BY
  i.InvoiceDate DESC
