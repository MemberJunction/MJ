WITH OfficerChanges AS (
  SELECT 
    co.ChapterID,
    co.Chapter,
    co.Position,
    co.MemberID,
    co.StartDate,
    co.EndDate,
    CASE 
      WHEN co.StartDate >= DATEADD(MONTH, -12, GETDATE()) THEN 1
      WHEN co.EndDate >= DATEADD(MONTH, -12, GETDATE()) AND co.EndDate IS NOT NULL THEN 1
      ELSE 0
    END AS IsRecentChange
  FROM [AssociationDemo].[vwChapterOfficers] co
  WHERE 
    (co.StartDate >= DATEADD(MONTH, -12, GETDATE()) 
     OR (co.EndDate >= DATEADD(MONTH, -12, GETDATE()) AND co.EndDate IS NOT NULL))
)
SELECT 
  oc.ChapterID,
  oc.Chapter,
  COUNT(DISTINCT CASE WHEN oc.IsRecentChange = 1 THEN oc.MemberID END) AS UniqueOfficerCount,
  COUNT(CASE WHEN oc.IsRecentChange = 1 THEN 1 END) AS TotalChanges,
  COUNT(DISTINCT CASE WHEN oc.StartDate >= DATEADD(MONTH, -12, GETDATE()) THEN oc.MemberID END) AS NewOfficers,
  COUNT(DISTINCT CASE WHEN oc.EndDate >= DATEADD(MONTH, -12, GETDATE()) AND oc.EndDate IS NOT NULL THEN oc.MemberID END) AS DepartedOfficers,
  MIN(CASE WHEN oc.StartDate >= DATEADD(MONTH, -12, GETDATE()) THEN oc.StartDate END) AS FirstChangeDate,
  MAX(COALESCE(oc.EndDate, oc.StartDate)) AS LastChangeDate
FROM OfficerChanges oc
GROUP BY oc.ChapterID, oc.Chapter
HAVING COUNT(CASE WHEN oc.IsRecentChange = 1 THEN 1 END) > 0
ORDER BY TotalChanges DESC, UniqueOfficerCount DESC