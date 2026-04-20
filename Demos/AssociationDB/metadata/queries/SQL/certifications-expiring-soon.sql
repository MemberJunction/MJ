SELECT 
    c.ID,
    c.CertificationNumber,
    c.CertificationType,
    c.DateEarned,
    c.DateExpires,
    DATEDIFF(DAY, GETDATE(), c.DateExpires) AS DaysUntilExpiration,
    c.Status,
    c.LastRenewalDate,
    c.NextRenewalDate,
    c.CECreditsEarned,
    m.ID AS MemberID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Phone,
    m.Mobile,
    m.Organization,
    m.City,
    m.State,
    m.Country
FROM [AssociationDemo].[vwCertifications] c
INNER JOIN [AssociationDemo].[vwMembers] m ON c.MemberID = m.ID
WHERE c.DateExpires IS NOT NULL
    AND c.DateExpires >= GETDATE()
    AND c.DateExpires <= DATEADD(DAY, {{ DaysAhead | sqlNumber }}, GETDATE())
    AND c.Status = 'Active'
ORDER BY c.DateExpires ASC, m.LastName ASC, m.FirstName ASC