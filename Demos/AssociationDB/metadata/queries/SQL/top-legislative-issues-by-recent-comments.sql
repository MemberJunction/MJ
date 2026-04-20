WITH RecentComments AS (
  SELECT 
    rc.LegislativeIssueID,
    COUNT(rc.ID) AS CommentCount
  FROM [AssociationDemo].[vwRegulatoryComments] rc
  WHERE rc.SubmittedDate >= DATEADD(MONTH, -6, GETDATE())
  GROUP BY rc.LegislativeIssueID
)
SELECT TOP 5
  li.ID,
  li.Title,
  li.IssueType,
  li.BillNumber,
  li.Status,
  li.ImpactLevel,
  li.Category,
  li.LegislativeBody,
  li.IntroducedDate,
  li.LastActionDate,
  COALESCE(rc.CommentCount, 0) AS RecentCommentCount,
  li.ImpactDescription,
  li.Summary
FROM [AssociationDemo].[vwLegislativeIssues] li
INNER JOIN RecentComments rc ON li.ID = rc.LegislativeIssueID
WHERE li.IsActive = 1
ORDER BY 
  CASE li.ImpactLevel
    WHEN 'Critical' THEN 1
    WHEN 'High' THEN 2
    WHEN 'Medium' THEN 3
    WHEN 'Low' THEN 4
    WHEN 'Monitoring' THEN 5
    ELSE 6
  END ASC,
  rc.CommentCount DESC