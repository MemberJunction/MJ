WITH ExpiringCerts AS (
  SELECT 
    c.ID,
    c.MemberID,
    c.CertificationTypeID,
    c.CertificationType,
    c.CertificationNumber,
    c.DateEarned,
    c.DateExpires,
    c.Status,
    c.LastRenewalDate,
    c.NextRenewalDate,
    c.CECreditsEarned,
    DATEDIFF(DAY, GETDATE(), c.DateExpires) AS DaysUntilExpiration
  FROM [AssociationDemo].[vwCertifications] c
  WHERE c.Status = 'Active'
    AND c.DateExpires IS NOT NULL
    AND c.DateExpires BETWEEN GETDATE() AND DATEADD(DAY, {{ DaysAhead | sqlNumber }}, GETDATE())
)
SELECT 
  ec.ID,
  ec.MemberID,
  ec.CertificationTypeID,
  ec.CertificationType,
  ec.CertificationNumber,
  ec.DateEarned,
  ec.DateExpires,
  ec.Status,
  ec.LastRenewalDate,
  ec.NextRenewalDate,
  ec.CECreditsEarned,
  ec.DaysUntilExpiration,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM [AssociationDemo].[vwCertificationRenewals] cr
      WHERE cr.CertificationID = ec.ID
        AND cr.ExpirationDate >= ec.DateExpires
        AND cr.Status IN ('Completed', 'Pending')
    ) THEN 1
    ELSE 0
  END AS HasPendingOrCompletedRenewal
FROM ExpiringCerts ec
WHERE NOT EXISTS (
  SELECT 1
  FROM [AssociationDemo].[vwCertificationRenewals] cr
  WHERE cr.CertificationID = ec.ID
    AND cr.ExpirationDate >= ec.DateExpires
    AND cr.Status IN ('Completed', 'Pending')
)
ORDER BY ec.DaysUntilExpiration ASC