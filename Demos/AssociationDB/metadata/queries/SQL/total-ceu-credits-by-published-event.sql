SELECT 
    e.ID,
    e.Name AS EventName,
    e.EventType,
    e.StartDate,
    e.EndDate,
    COUNT(es.ID) AS SessionCount,
    COALESCE(SUM(es.CEUCredits), 0) AS TotalCEUCredits
FROM [AssociationDemo].[vwEvents] e
LEFT JOIN [AssociationDemo].[vwEventSessions] es ON e.ID = es.EventID
WHERE e.Status = 'Published'
GROUP BY e.ID, e.Name, e.EventType, e.StartDate, e.EndDate
ORDER BY TotalCEUCredits DESC