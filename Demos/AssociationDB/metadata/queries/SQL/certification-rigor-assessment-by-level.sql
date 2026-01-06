SELECT
    ct.Level,
    COUNT(*) AS TotalCertifications,
    SUM(CASE WHEN ct.ExamRequired = 1 AND ct.PracticalRequired = 1 THEN 1 ELSE 0 END) AS BothRequired,
    SUM(CASE WHEN ct.ExamRequired = 1 THEN 1 ELSE 0 END) AS ExamRequired,
    SUM(CASE WHEN ct.PracticalRequired = 1 THEN 1 ELSE 0 END) AS PracticalRequired,
    SUM(CASE WHEN ct.ExamRequired = 0 AND ct.PracticalRequired = 0 THEN 1 ELSE 0 END) AS NeitherRequired
FROM [AssociationDemo].[vwCertificationTypes] ct
WHERE ct.IsActive = 1
    AND ct.Level IS NOT NULL
GROUP BY ct.Level
ORDER BY
    CASE ct.Level
        WHEN 'Entry' THEN 1
        WHEN 'Intermediate' THEN 2
        WHEN 'Advanced' THEN 3
        WHEN 'Specialty' THEN 4
        WHEN 'Master' THEN 5
        ELSE 6
    END