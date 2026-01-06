SELECT 
    m.ID AS MemberID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Organization,
    m.City,
    m.State,
    m.Country,
    COUNT(i.ID) AS OutstandingInvoiceCount,
    SUM(i.Balance) AS TotalOutstandingBalance,
    MIN(i.DueDate) AS OldestDueDate,
    MAX(i.DueDate) AS NewestDueDate,
    SUM(CASE WHEN i.DueDate < CAST(GETDATE() AS DATE) THEN i.Balance ELSE 0 END) AS OverdueBalance,
    SUM(CASE WHEN i.DueDate >= CAST(GETDATE() AS DATE) THEN i.Balance ELSE 0 END) AS CurrentBalance
FROM [AssociationDemo].[vwMembers] m
INNER JOIN [AssociationDemo].[vwInvoices] i ON i.MemberID = m.ID
WHERE i.Balance > 0
{% if MinBalance %}
    AND i.Balance >= {{ MinBalance | sqlNumber }}
{% endif %}
{% if Status %}
    AND i.Status IN {{ Status | sqlIn }}
{% endif %}
GROUP BY 
    m.ID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Organization,
    m.City,
    m.State,
    m.Country
HAVING SUM(i.Balance) >= {{ MinTotalBalance | sqlNumber }}
ORDER BY TotalOutstandingBalance DESC