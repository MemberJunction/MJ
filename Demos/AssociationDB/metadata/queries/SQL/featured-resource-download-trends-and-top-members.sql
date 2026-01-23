WITH MonthlyTrends AS (
  SELECT 
    YEAR(rd.DownloadDate) AS Year,
    MONTH(rd.DownloadDate) AS Month,
    DATEFROMPARTS(YEAR(rd.DownloadDate), MONTH(rd.DownloadDate), 1) AS MonthStart,
    COUNT(rd.ID) AS TotalDownloads,
    COUNT(DISTINCT rd.MemberID) AS ActiveMembers,
    COUNT(DISTINCT rd.ResourceID) AS ResourcesDownloaded
  FROM [AssociationDemo].[vwResourceDownloads] rd
  INNER JOIN [AssociationDemo].[vwResources] r ON rd.ResourceID = r.ID
  WHERE r.IsFeatured = 1
    AND rd.DownloadDate >= {{ startDate | sqlDate }}
    AND rd.DownloadDate < {{ endDate | sqlDate }}
  GROUP BY 
    YEAR(rd.DownloadDate),
    MONTH(rd.DownloadDate),
    DATEFROMPARTS(YEAR(rd.DownloadDate), MONTH(rd.DownloadDate), 1)
),
TopMembers AS (
  SELECT
    rd.MemberID,
    COUNT(rd.ID) AS TotalDownloads,
    COUNT(DISTINCT rd.ResourceID) AS UniqueResourcesDownloaded,
    COUNT(DISTINCT DATEFROMPARTS(YEAR(rd.DownloadDate), MONTH(rd.DownloadDate), 1)) AS ActiveMonths,
    MIN(rd.DownloadDate) AS FirstDownload,
    MAX(rd.DownloadDate) AS LastDownload
  FROM [AssociationDemo].[vwResourceDownloads] rd
  INNER JOIN [AssociationDemo].[vwResources] r ON rd.ResourceID = r.ID
  WHERE r.IsFeatured = 1
    AND rd.DownloadDate >= {{ startDate | sqlDate }}
    AND rd.DownloadDate < {{ endDate | sqlDate }}
  GROUP BY rd.MemberID
  HAVING COUNT(rd.ID) >= COALESCE({{ minDownloadsThreshold | sqlNumber }}, 1)
)
SELECT
  'MonthlyTrend' AS RecordType,
  mt.Year,
  mt.Month,
  mt.MonthStart,
  mt.TotalDownloads,
  mt.ActiveMembers,
  mt.ResourcesDownloaded,
  NULL AS MemberID,
  NULL AS MemberTotalDownloads,
  NULL AS UniqueResourcesDownloaded,
  NULL AS ActiveMonths,
  NULL AS FirstDownload,
  NULL AS LastDownload
FROM MonthlyTrends mt

UNION ALL

SELECT
  'TopMember' AS RecordType,
  NULL AS Year,
  NULL AS Month,
  NULL AS MonthStart,
  NULL AS TotalDownloads,
  NULL AS ActiveMembers,
  NULL AS ResourcesDownloaded,
  tm.MemberID,
  tm.TotalDownloads AS MemberTotalDownloads,
  tm.UniqueResourcesDownloaded,
  tm.ActiveMonths,
  tm.FirstDownload,
  tm.LastDownload
FROM TopMembers tm

ORDER BY 
  RecordType,
  Year DESC,
  Month DESC,
  MemberTotalDownloads DESC