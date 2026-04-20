SELECT
    SUM(i.Balance) AS TotalOutstandingBalance,
    COUNT(*) AS UnpaidInvoiceCount,
    MIN(i.InvoiceDate) AS OldestInvoiceDate,
    MAX(i.InvoiceDate) AS NewestInvoiceDate
FROM [AssociationDemo].[vwInvoices] i
WHERE i.Status IN ('Partial', 'Sent', 'Overdue')
    AND i.Balance > 0