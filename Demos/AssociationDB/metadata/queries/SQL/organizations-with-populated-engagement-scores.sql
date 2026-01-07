SELECT 
    o.ID AS OrganizationID,
    o.Name AS OrganizationName,
    o.Industry,
    o.City,
    o.State,
    o.Country,
    COUNT(m.ID) AS MemberCount,
    AVG(m.EngagementScore) AS AvgEngagementScore,
    MIN(m.EngagementScore) AS MinEngagementScore,
    MAX(m.EngagementScore) AS MaxEngagementScore
FROM [AssociationDemo].[vwOrganizations] o
INNER JOIN [AssociationDemo].[vwMembers] m ON o.ID = m.OrganizationID
WHERE m.EngagementScore > 0
GROUP BY o.ID, o.Name, o.Industry, o.City, o.State, o.Country
HAVING COUNT(m.ID) >= {{ minMemberCount | sqlNumber }}
ORDER BY AvgEngagementScore DESC