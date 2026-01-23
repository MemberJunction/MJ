SELECT 
    o.Name AS OrganizationName,
    COUNT(DISTINCT i.ID) AS InvoiceCount,
    COUNT(DISTINCT i.MemberID) AS MemberCount,
    AVG(i.Total) AS AverageInvoiceTotal,
    SUM(i.Total) AS TotalInvoiceAmount,
    MIN(i.Total) AS MinInvoiceTotal,
    MAX(i.Total) AS MaxInvoiceTotal,
    MIN(i.InvoiceDate) AS FirstInvoiceDate,
    MAX(i.InvoiceDate) AS LastInvoiceDate
FROM [AssociationDemo].[vwInvoices] i
INNER JOIN [AssociationDemo].[vwMembers] m ON i.MemberID = m.ID
INNER JOIN [AssociationDemo].[vwOrganizations] o ON m.OrganizationID = o.ID
WHERE m.OrganizationID IS NOT NULL
GROUP BY o.Name
ORDER BY AverageInvoiceTotal DESC