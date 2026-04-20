WITH CertificationStats AS (
  SELECT 
    ct.ID,
    ct.Name,
    ct.Abbreviation,
    ct.Level,
    COUNT(c.ID) AS TotalCertifications,
    SUM(CASE WHEN c.Status = 'Active' THEN 1 ELSE 0 END) AS ActiveCertifications,
    SUM(CASE WHEN c.Status IN ('Expired', 'Suspended', 'Revoked') THEN 1 ELSE 0 END) AS InactiveCertifications,
    MIN(c.DateEarned) AS FirstCertificationDate,
    MAX(c.DateEarned) AS LastCertificationDate
  FROM [AssociationDemo].[vwCertificationTypes] ct
  LEFT JOIN [AssociationDemo].[vwCertifications] c ON ct.ID = c.CertificationTypeID
  WHERE ct.IsActive = 1
  GROUP BY ct.ID, ct.Name, ct.Abbreviation, ct.Level
)
SELECT 
  ID,
  Name AS CertificationProgram,
  Abbreviation,
  Level,
  TotalCertifications,
  ActiveCertifications,
  InactiveCertifications,
  FirstCertificationDate,
  LastCertificationDate
FROM CertificationStats
WHERE TotalCertifications > 0
ORDER BY ActiveCertifications DESC, TotalCertifications DESC