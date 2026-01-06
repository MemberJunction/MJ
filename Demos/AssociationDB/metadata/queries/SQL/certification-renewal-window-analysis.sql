-- Calculate average time between certification expiration and last renewal date
-- for members who have renewed at least twice
-- Also provide context about overall certification renewal data

WITH RenewalStats AS (
    SELECT 
        c.ID,
        c.MemberID,
        c.CertificationType,
        c.RenewalCount,
        c.LastRenewalDate,
        c.DateExpires,
        c.Status,
        DATEDIFF(DAY, c.LastRenewalDate, c.DateExpires) AS DaysToExpiration
    FROM [AssociationDemo].[vwCertifications] c
    WHERE c.LastRenewalDate IS NOT NULL
        AND c.DateExpires IS NOT NULL
        AND c.RenewalCount >= {{ minRenewalCount | sqlNumber }}
),
OverallContext AS (
    SELECT
        COUNT(*) AS TotalCertifications,
        COUNT(DISTINCT MemberID) AS TotalMembers,
        SUM(CASE WHEN RenewalCount >= 1 THEN 1 ELSE 0 END) AS CertificationsWithRenewals,
        SUM(CASE WHEN RenewalCount >= 2 THEN 1 ELSE 0 END) AS CertificationsWithTwoPlusRenewals,
        MAX(RenewalCount) AS MaxRenewalCount
    FROM [AssociationDemo].[vwCertifications]
)
SELECT 
    -- Main metrics for certifications meeting criteria
    AVG(rs.DaysToExpiration) AS AvgDaysToExpiration,
    COUNT(*) AS QualifyingCertifications,
    COUNT(DISTINCT rs.MemberID) AS QualifyingMembers,
    MIN(rs.DaysToExpiration) AS MinDaysToExpiration,
    MAX(rs.DaysToExpiration) AS MaxDaysToExpiration,
    
    -- Context about overall certification data
    oc.TotalCertifications,
    oc.TotalMembers,
    oc.CertificationsWithRenewals,
    oc.CertificationsWithTwoPlusRenewals,
    oc.MaxRenewalCount
FROM RenewalStats rs
CROSS JOIN OverallContext oc
GROUP BY 
    oc.TotalCertifications,
    oc.TotalMembers,
    oc.CertificationsWithRenewals,
    oc.CertificationsWithTwoPlusRenewals,
    oc.MaxRenewalCount