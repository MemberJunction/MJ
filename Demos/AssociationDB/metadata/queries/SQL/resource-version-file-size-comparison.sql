-- Calculate average file size for current vs non-current resource versions
SELECT 
    CASE 
        WHEN rv.IsCurrent = 1 THEN 'Current Version'
        ELSE 'Non-Current Version'
    END AS VersionStatus,
    COUNT(rv.ID) AS VersionCount,
    AVG(rv.FileSizeBytes) AS AvgFileSizeBytes,
    MIN(rv.FileSizeBytes) AS MinFileSizeBytes,
    MAX(rv.FileSizeBytes) AS MaxFileSizeBytes,
    SUM(rv.FileSizeBytes) AS TotalFileSizeBytes
FROM [AssociationDemo].[vwResourceVersions] rv
WHERE rv.FileSizeBytes IS NOT NULL
    AND rv.FileSizeBytes > 0
GROUP BY rv.IsCurrent
ORDER BY rv.IsCurrent DESC