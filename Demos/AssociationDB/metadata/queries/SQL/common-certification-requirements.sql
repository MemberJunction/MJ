SELECT 
  cr.RequirementType,
  COUNT(DISTINCT cr.CertificationTypeID) AS CertificationProgramCount,
  COUNT(cr.ID) AS TotalRequirements,
  SUM(CASE WHEN cr.IsRequired = 1 THEN 1 ELSE 0 END) AS MandatoryCount,
  SUM(CASE WHEN cr.IsRequired = 0 THEN 1 ELSE 0 END) AS OptionalCount
FROM [AssociationDemo].[vwCertificationRequirements] cr
INNER JOIN [AssociationDemo].[vwCertificationTypes] ct ON cr.CertificationTypeID = ct.ID
WHERE ct.IsActive = 1
GROUP BY cr.RequirementType
ORDER BY CertificationProgramCount DESC, TotalRequirements DESC