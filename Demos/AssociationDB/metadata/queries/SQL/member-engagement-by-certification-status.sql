SELECT 
  COALESCE(c.Status, 'No Certification') AS CertificationStatus,
  COUNT(DISTINCT m.ID) AS MemberCount,
  AVG(m.EngagementScore) AS AvgEngagementScore,
  MIN(m.EngagementScore) AS MinEngagementScore,
  MAX(m.EngagementScore) AS MaxEngagementScore,
  SUM(CASE WHEN m.EngagementScore > 0 THEN 1 ELSE 0 END) AS MembersWithEngagement,
  COUNT(c.ID) AS TotalCertifications
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN [AssociationDemo].[vwCertifications] c ON m.ID = c.MemberID
  {% if IncludeOnlyActiveCerts %}AND c.Status = 'Active'{% endif %}
GROUP BY COALESCE(c.Status, 'No Certification')
ORDER BY AvgEngagementScore DESC