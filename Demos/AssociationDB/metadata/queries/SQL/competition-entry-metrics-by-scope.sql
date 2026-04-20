SELECT 
  c.IsInternational,
  CASE 
    WHEN c.IsInternational = 1 THEN 'International'
    ELSE 'Domestic'
  END AS CompetitionScope,
  COUNT(c.ID) AS CompetitionCount,
  AVG(c.EntryFee) AS AvgEntryFee,
  SUM(c.TotalEntries) AS TotalEntries,
  MIN(c.EntryFee) AS MinEntryFee,
  MAX(c.EntryFee) AS MaxEntryFee,
  AVG(c.TotalEntries) AS AvgEntriesPerCompetition
FROM [AssociationDemo].[vwCompetitions] c
WHERE c.Year = {{ year | sqlNumber }}
  AND c.EntryFee IS NOT NULL
GROUP BY c.IsInternational
ORDER BY c.IsInternational DESC