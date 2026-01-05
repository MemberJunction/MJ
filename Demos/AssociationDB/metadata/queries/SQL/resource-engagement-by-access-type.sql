SELECT
    RequiresMembership,
    CASE 
        WHEN RequiresMembership = 1 THEN 'Membership Required'
        ELSE 'Public Access'
    END AS AccessType,
    COUNT(r.ID) AS ResourceCount,
    SUM(r.DownloadCount) AS TotalDownloads,
    SUM(r.ViewCount) AS TotalViews,
    AVG(r.DownloadCount) AS AvgDownloadsPerResource,
    AVG(r.ViewCount) AS AvgViewsPerResource
FROM [AssociationDemo].[vwResources] r
WHERE r.Status = 'Published'
GROUP BY r.RequiresMembership
ORDER BY r.RequiresMembership DESC