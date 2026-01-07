SELECT 
  CommitteeType,
  COUNT(*) AS CommitteeCount
FROM [AssociationDemo].[vwCommittees]
WHERE IsActive = 1
GROUP BY CommitteeType
ORDER BY CommitteeCount DESC