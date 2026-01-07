SELECT 
  CASE 
    WHEN e.ID IS NOT NULL AND e.Status = 'Completed' THEN 'Completed Courses'
    ELSE 'No Completions'
  END AS CompletionStatus,
  COUNT(DISTINCT m.ID) AS MemberCount,
  AVG(m.EngagementScore) AS AvgEngagementScore,
  MIN(m.EngagementScore) AS MinEngagementScore,
  MAX(m.EngagementScore) AS MaxEngagementScore,
  SUM(CASE WHEN m.EngagementScore >= 75 THEN 1 ELSE 0 END) AS HighEngagementMembers,
  SUM(CASE WHEN m.EngagementScore < 50 THEN 1 ELSE 0 END) AS LowEngagementMembers
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN [AssociationDemo].[vwEnrollments] e 
  ON m.ID = e.MemberID 
  AND e.Status = 'Completed'
GROUP BY 
  CASE 
    WHEN e.ID IS NOT NULL AND e.Status = 'Completed' THEN 'Completed Courses'
    ELSE 'No Completions'
  END
ORDER BY AvgEngagementScore DESC