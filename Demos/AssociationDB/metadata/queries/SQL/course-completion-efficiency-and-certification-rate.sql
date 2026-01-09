WITH RecentCompletions AS (
  SELECT 
    e.ID,
    e.CourseID,
    e.StartDate,
    e.CompletionDate,
    DATEDIFF(DAY, e.StartDate, e.CompletionDate) AS DaysToComplete
  FROM [AssociationDemo].[vwEnrollments] e
  WHERE e.Status = 'Completed'
    AND e.CompletionDate >= DATEADD(MONTH, -6, GETDATE())
    AND e.StartDate IS NOT NULL
    AND e.CompletionDate IS NOT NULL
)
SELECT 
  COUNT(rc.ID) AS CompletedEnrollments,
  AVG(rc.DaysToComplete) AS AvgDaysToComplete,
  MIN(rc.DaysToComplete) AS MinDaysToComplete,
  MAX(rc.DaysToComplete) AS MaxDaysToComplete,
  COUNT(c.ID) AS CertificatesIssued,
  MIN(rc.CompletionDate) AS EarliestCompletion,
  MAX(rc.CompletionDate) AS LatestCompletion
FROM RecentCompletions rc
LEFT JOIN [AssociationDemo].[vwCertificates] c 
  ON rc.ID = c.EnrollmentID