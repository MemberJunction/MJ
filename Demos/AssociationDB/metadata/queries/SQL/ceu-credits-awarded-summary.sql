-- Summarize total CEU credits awarded across all events
-- Compares registrants who attended vs those who received CEU awards
SELECT
  COUNT(DISTINCT er.EventID) AS TotalEventsWithAttendees,
  COUNT(DISTINCT er.ID) AS TotalAttendeesCheckedIn,
  SUM(CASE WHEN er.CEUAwarded = 1 THEN 1 ELSE 0 END) AS AttendeesAwardedCEU,
  SUM(CASE WHEN er.CEUAwarded = 1 THEN COALESCE(e.CEUCredits, 0) ELSE 0 END) AS TotalCEUCreditsAwarded,
  COUNT(DISTINCT CASE WHEN er.CEUAwarded = 1 THEN er.EventID END) AS EventsWithCEUAwarded
FROM [AssociationDemo].[vwEventRegistrations] er
INNER JOIN [AssociationDemo].[vwEvents] e
  ON er.EventID = e.ID
WHERE er.Status = 'Attended'
  AND er.CheckInTime IS NOT NULL