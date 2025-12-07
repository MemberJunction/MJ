-- Outstanding Invoices Query
-- Returns all unpaid/partially paid invoices with calculated days overdue
-- Includes invoice details, account info, and aging calculation
-- Client-side code can group into aging buckets, aggregate by account, etc.
-- This general-purpose query supports multiple dashboard views and reports

SELECT
  i.ID,
  i.InvoiceNumber,
  i.AccountID,
  i.Account,
  i.InvoiceDate,
  i.DueDate,
  i.Status,
  i.TotalAmount,
  i.AmountPaid,
  i.BalanceDue,
  DATEDIFF(day, i.DueDate, GETDATE()) AS DaysOverdue
FROM CRM.vwInvoices i
WHERE i.Status NOT IN ('Paid', 'Cancelled')
  AND i.BalanceDue > 0
{% if MinOutstanding %}  AND i.BalanceDue >= {{ MinOutstanding | sqlNumber }}
{% endif %}{% if AccountType %}  AND i.AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType = {{ AccountType | sqlString }})
{% endif %}{% if AccountID %}  AND i.AccountID = {{ AccountID | sqlNumber }}
{% endif %}{% if AccountName %}  AND i.Account = {{ AccountName | sqlString }}
{% endif %}ORDER BY i.DueDate ASC, i.BalanceDue DESC
