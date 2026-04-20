-- Identify certificates expiring in the next 90 days with course details
SELECT 
    c.ID AS CertificateID,
    c.CertificateNumber,
    c.IssuedDate,
    c.ExpirationDate,
    DATEDIFF(DAY, GETDATE(), c.ExpirationDate) AS DaysUntilExpiration,
    e.CourseID,
    COUNT(*) OVER (PARTITION BY e.CourseID) AS ExpirationsPerCourse
FROM [AssociationDemo].[vwCertificates] c
INNER JOIN [AssociationDemo].[vwEnrollments] e ON c.EnrollmentID = e.ID
WHERE c.ExpirationDate IS NOT NULL
  AND c.ExpirationDate BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, {{ daysAhead | sqlNumber }}, GETDATE())
ORDER BY c.ExpirationDate ASC, e.CourseID