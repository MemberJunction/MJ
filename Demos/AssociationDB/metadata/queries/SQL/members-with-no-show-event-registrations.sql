-- Members who registered for events but did not attend (no-shows)
-- Shows count of no-shows and total CEU credits missed

SELECT 
    m.ID AS MemberID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Organization,
    COUNT(er.ID) AS NoShowCount,
    SUM(CASE WHEN er.CEUAwarded = 0 THEN 1 ELSE 0 END) AS MissedCEUOpportunities,
    MIN(er.RegistrationDate) AS FirstNoShowDate,
    MAX(er.RegistrationDate) AS LastNoShowDate
FROM [AssociationDemo].[vwMembers] m
INNER JOIN [AssociationDemo].[vwEventRegistrations] er 
    ON m.ID = er.MemberID
WHERE er.Status = 'No Show'
    {% if StartDate %}AND er.RegistrationDate >= {{ StartDate | sqlDate }}{% endif %}
    {% if EndDate %}AND er.RegistrationDate <= {{ EndDate | sqlDate }}{% endif %}
GROUP BY 
    m.ID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Organization
HAVING COUNT(er.ID) >= COALESCE({{ MinNoShows | sqlNumber }}, 1)
ORDER BY NoShowCount DESC, LastNoShowDate DESC