-- Compare engagement scores between event attendees and non-attendees
WITH EventAttendees AS (
    SELECT DISTINCT 
        m.ID,
        m.Email,
        m.FirstName,
        m.LastName,
        m.EngagementScore
    FROM [AssociationDemo].[vwMembers] m
    INNER JOIN [AssociationDemo].[vwEventRegistrations] er 
        ON m.ID = er.MemberID
    WHERE er.Status = 'Attended'
        AND er.RegistrationDate >= DATEADD(YEAR, -1, GETDATE())
),
NonAttendees AS (
    SELECT 
        m.ID,
        m.Email,
        m.FirstName,
        m.LastName,
        m.EngagementScore
    FROM [AssociationDemo].[vwMembers] m
    WHERE NOT EXISTS (
        SELECT 1 
        FROM [AssociationDemo].[vwEventRegistrations] er
        WHERE er.MemberID = m.ID
            AND er.Status = 'Attended'
            AND er.RegistrationDate >= DATEADD(YEAR, -1, GETDATE())
    )
)
SELECT 
    'Event Attendees' AS MemberGroup,
    COUNT(*) AS MemberCount,
    AVG(CAST(EngagementScore AS FLOAT)) AS AvgEngagementScore,
    MIN(EngagementScore) AS MinEngagementScore,
    MAX(EngagementScore) AS MaxEngagementScore,
    STDEV(EngagementScore) AS StdDevEngagementScore
FROM EventAttendees

UNION ALL

SELECT 
    'Non-Attendees' AS MemberGroup,
    COUNT(*) AS MemberCount,
    AVG(CAST(EngagementScore AS FLOAT)) AS AvgEngagementScore,
    MIN(EngagementScore) AS MinEngagementScore,
    MAX(EngagementScore) AS MaxEngagementScore,
    STDEV(EngagementScore) AS StdDevEngagementScore
FROM NonAttendees

ORDER BY MemberGroup DESC