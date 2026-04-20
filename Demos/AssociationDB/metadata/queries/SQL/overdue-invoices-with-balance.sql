SELECT 
    i.ID,
    i.InvoiceNumber,
    i.InvoiceDate,
    i.DueDate,
    DATEDIFF(DAY, i.DueDate, GETDATE()) AS DaysOverdue,
    i.SubTotal,
    i.Tax,
    i.Discount,
    i.Total,
    i.AmountPaid,
    i.Balance,
    i.Status,
    i.MemberID,
    i.PaymentTerms,
    i.Notes
FROM [AssociationDemo].[vwInvoices] i
WHERE i.Balance > 0
    AND i.DueDate < CAST(GETDATE() AS DATE)
    {% if Status %}
    AND i.Status = {{ Status | sqlString }}
    {% endif %}
    {% if MinBalance %}
    AND i.Balance >= {{ MinBalance | sqlNumber }}
    {% endif %}
    {% if MaxDaysOverdue %}
    AND DATEDIFF(DAY, i.DueDate, GETDATE()) <= {{ MaxDaysOverdue | sqlNumber }}
    {% endif %}
ORDER BY i.DueDate ASC