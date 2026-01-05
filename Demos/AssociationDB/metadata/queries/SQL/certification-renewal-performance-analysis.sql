SELECT 
    ct.Name AS CertificationType,
    ct.Abbreviation,
    c.CertificationNumber,
    m.FirstName + ' ' + m.LastName AS MemberName,
    m.Email AS MemberEmail,
    c.DateExpires,
    DATEDIFF(DAY, GETDATE(), c.DateExpires) AS DaysUntilExpiration,
    ct.CECreditsRequired,
    COALESCE(c.CECreditsEarned, 0) AS CECreditsEarned,
    ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) AS CECreditGap,
    c.Status,
    c.LastRenewalDate,
    c.NextRenewalDate,
    CASE 
        WHEN c.Status = 'Expired' THEN 'Critical - Already Expired'
        WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 
             AND DATEDIFF(DAY, GETDATE(), c.DateExpires) <= 60 THEN 'High Risk'
        WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 
             AND DATEDIFF(DAY, GETDATE(), c.DateExpires) <= 120 THEN 'Medium Risk'
        WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 THEN 'Low Risk'
        ELSE 'On Track'
    END AS RiskLevel
FROM [AssociationDemo].[vwCertifications] c
INNER JOIN [AssociationDemo].[vwCertificationTypes] ct 
    ON c.CertificationTypeID = ct.ID
INNER JOIN [AssociationDemo].[vwMembers] m 
    ON c.MemberID = m.ID
WHERE c.DateExpires IS NOT NULL
    AND c.DateExpires BETWEEN GETDATE() AND DATEADD(MONTH, {{ monthsAhead | sqlNumber }}, GETDATE())
    AND c.Status IN ('Active', 'Pending Renewal')
    {% if riskLevelFilter %}
    AND CASE 
            WHEN c.Status = 'Expired' THEN 'Critical - Already Expired'
            WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 
                 AND DATEDIFF(DAY, GETDATE(), c.DateExpires) <= 60 THEN 'High Risk'
            WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 
                 AND DATEDIFF(DAY, GETDATE(), c.DateExpires) <= 120 THEN 'Medium Risk'
            WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 THEN 'Low Risk'
            ELSE 'On Track'
        END = {{ riskLevelFilter | sqlString }}
    {% endif %}
ORDER BY 
    CASE 
        WHEN c.Status = 'Expired' THEN 1
        WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 
             AND DATEDIFF(DAY, GETDATE(), c.DateExpires) <= 60 THEN 2
        WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 
             AND DATEDIFF(DAY, GETDATE(), c.DateExpires) <= 120 THEN 3
        WHEN ct.CECreditsRequired - COALESCE(c.CECreditsEarned, 0) > 0 THEN 4
        ELSE 5
    END,
    c.DateExpires ASC