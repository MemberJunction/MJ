-- Calculate event no-show rates by identifying registrants who never checked in
-- Returns events with highest no-show percentages to identify attendance issues

SELECT 
    e.ID AS EventID,
    e.Name AS EventName,
    e.EventType,
    e.StartDate,
    e.EndDate,
    e.Location,
    e.IsVirtual,
    COUNT(er.ID) AS TotalRegistrations,
    SUM(CASE 
        WHEN er.CheckInTime IS NULL OR er.Status = 'No Show' 
        THEN 1 
        ELSE 0 
    END) AS NoShowCount,
    SUM(CASE 
        WHEN er.CheckInTime IS NOT NULL AND er.Status != 'No Show' 
        THEN 1 
        ELSE 0 
    END) AS CheckedInCount,
    SUM(CASE 
        WHEN er.Status = 'Cancelled' 
        THEN 1 
        ELSE 0 
    END) AS CancelledCount
FROM [AssociationDemo].[vwEvents] e
INNER JOIN [AssociationDemo].[vwEventRegistrations] er 
    ON e.ID = er.EventID
WHERE e.Status = 'Completed'
    AND e.EndDate < GETDATE()
    {% if EventType %}
    AND e.EventType = {{ EventType | sqlString }}
    {% endif %}
    {% if StartDate %}
    AND e.StartDate >= {{ StartDate | sqlDate }}
    {% endif %}
    {% if EndDate %}
    AND e.EndDate <= {{ EndDate | sqlDate }}
    {% endif %}
GROUP BY 
    e.ID,
    e.Name,
    e.EventType,
    e.StartDate,
    e.EndDate,
    e.Location,
    e.IsVirtual
HAVING COUNT(er.ID) > 0
ORDER BY 
    NoShowCount DESC,
    TotalRegistrations DESC