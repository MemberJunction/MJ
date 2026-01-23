SELECT 
  e.Name AS EventName,
  e.VirtualPlatform,
  es.Name AS SessionName,
  es.SpeakerName,
  es.Capacity,
  es.StartTime AS SessionStartTime,
  es.EndTime AS SessionEndTime,
  es.Room,
  es.SessionType
FROM [AssociationDemo].[vwEvents] e
INNER JOIN [AssociationDemo].[vwEventSessions] es 
  ON e.ID = es.EventID
WHERE e.IsVirtual = 1
  AND e.VirtualPlatform IS NOT NULL
  AND es.Capacity IS NOT NULL
ORDER BY e.StartDate DESC, es.StartTime ASC