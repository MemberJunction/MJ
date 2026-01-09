-- Count active legislative issues grouped by impact level
-- Calculate percentage with formal policy positions adopted
SELECT 
  li.ImpactLevel,
  COUNT(li.ID) AS TotalIssues,
  SUM(CASE WHEN pp.AdoptedDate IS NOT NULL THEN 1 ELSE 0 END) AS IssuesWithPositions,
  COUNT(pp.ID) AS TotalPositions
FROM [AssociationDemo].[vwLegislativeIssues] li
LEFT JOIN [AssociationDemo].[vwPolicyPositions] pp 
  ON li.ID = pp.LegislativeIssueID
WHERE li.IsActive = 1
GROUP BY li.ImpactLevel
ORDER BY 
  CASE li.ImpactLevel
    WHEN 'Critical' THEN 1
    WHEN 'High' THEN 2
    WHEN 'Medium' THEN 3
    WHEN 'Low' THEN 4
    WHEN 'Monitoring' THEN 5
    ELSE 6
  END