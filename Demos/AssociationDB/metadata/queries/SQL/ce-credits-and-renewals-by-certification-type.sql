SELECT 
  c.CertificationTypeID,
  c.CertificationType,
  COUNT(DISTINCT c.ID) AS TotalCertifications,
  AVG(CAST(c.CECreditsEarned AS FLOAT)) AS AvgCECreditsEarned,
  COUNT(DISTINCT cr.ID) AS TotalRenewals,
  COUNT(DISTINCT CASE WHEN cr.Status = 'Completed' THEN cr.ID END) AS CompletedRenewals,
  COUNT(DISTINCT CASE WHEN cr.Status = 'Completed' THEN c.MemberID END) AS MembersWithCompletedRenewals,
  SUM(CASE WHEN cr.Status = 'Completed' THEN cr.CECreditsApplied ELSE 0 END) AS TotalCECreditsApplied,
  MIN(c.DateEarned) AS EarliestCertificationDate,
  MAX(c.DateEarned) AS LatestCertificationDate
FROM [AssociationDemo].[vwCertifications] c
LEFT JOIN [AssociationDemo].[vwCertificationRenewals] cr ON c.ID = cr.CertificationID
GROUP BY c.CertificationTypeID, c.CertificationType
ORDER BY AvgCECreditsEarned DESC