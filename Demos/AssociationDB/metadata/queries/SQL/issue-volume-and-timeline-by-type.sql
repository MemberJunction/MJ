SELECT 
  li.IssueType,
  COUNT(li.ID) AS IssueCount,
  AVG(DATEDIFF(DAY, li.IntroducedDate, li.LastActionDate)) AS AvgDaysIntroToLastAction,
  MIN(li.IntroducedDate) AS EarliestIntroduced,
  MAX(li.LastActionDate) AS LatestAction
FROM [AssociationDemo].[vwLegislativeIssues] li
INNER JOIN [AssociationDemo].[vwLegislativeBodies] lb 
  ON li.LegislativeBodyID = lb.ID
WHERE lb.Level = 'Federal'
  AND li.IntroducedDate IS NOT NULL
  AND li.LastActionDate IS NOT NULL
GROUP BY li.IssueType
ORDER BY IssueCount DESC