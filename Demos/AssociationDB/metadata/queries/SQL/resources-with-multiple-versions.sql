SELECT 
    r.ID AS ResourceID,
    r.Title,
    r.ResourceType,
    r.Category,
    COUNT(rv.ID) AS VersionCount,
    MIN(rv.CreatedDate) AS FirstVersionDate,
    MAX(rv.CreatedDate) AS LastVersionDate,
    MAX(CASE WHEN rv.IsCurrent = 1 THEN rv.VersionNumber END) AS CurrentVersion,
    MAX(CASE WHEN rv.IsCurrent = 1 THEN rv.CreatedDate END) AS CurrentVersionDate
FROM [AssociationDemo].[vwResources] r
INNER JOIN [AssociationDemo].[vwResourceVersions] rv ON r.ID = rv.ResourceID
GROUP BY r.ID, r.Title, r.ResourceType, r.Category
HAVING COUNT(rv.ID) > 1
ORDER BY VersionCount DESC, r.Title