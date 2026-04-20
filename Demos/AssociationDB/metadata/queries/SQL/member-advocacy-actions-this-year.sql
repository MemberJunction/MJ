SELECT 
    m.ID AS MemberID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Organization,
    COUNT(aa.ID) AS ActionCount,
    MIN(aa.ActionDate) AS FirstActionDate,
    MAX(aa.ActionDate) AS LastActionDate
FROM [AssociationDemo].[vwMembers] m
INNER JOIN [AssociationDemo].[vwAdvocacyActions] aa 
    ON m.ID = aa.MemberID
WHERE YEAR(aa.ActionDate) = YEAR(GETDATE())
GROUP BY 
    m.ID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Organization
ORDER BY ActionCount DESC