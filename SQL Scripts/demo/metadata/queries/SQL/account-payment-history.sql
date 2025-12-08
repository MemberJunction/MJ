-- Account Payment History Query
-- Detailed payment history for selected account with invoice details
-- Returns raw payment transactions with dates for client-side categorization
-- Note: PaymentStatus bucketing (On Time/Late/Overdue/Pending) handled client-side
-- This general-purpose query supports multiple dashboard views and reports

SELECT
  i.InvoiceNumber,
  i.InvoiceDate,
  i.DueDate,
  i.TotalAmount,
  i.AmountPaid,
  i.BalanceDue,
  i.Status,
  p.PaymentDate,
  p.Amount AS PaymentAmount,
  p.PaymentMethod,
  p.ReferenceNumber,
  DATEDIFF(day, i.InvoiceDate, p.PaymentDate) AS DaysToPayment
FROM CRM.vwInvoices i
LEFT JOIN CRM.vwPayments p ON p.InvoiceID = i.ID
WHERE 1=1
{% if AccountID %}  AND i.AccountID = {{ AccountID | sqlNumber }}
{% endif %}{% if AccountName %}  AND i.AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE Name = {{ AccountName | sqlString }})
{% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}ORDER BY i.InvoiceDate DESC, p.PaymentDate DESC
