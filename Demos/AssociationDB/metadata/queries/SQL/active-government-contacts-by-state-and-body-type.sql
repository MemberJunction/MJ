SELECT 
  lb.State,
  lb.BodyType,
  COUNT(gc.ID) AS ContactCount
FROM [AssociationDemo].[vwGovernmentContacts] gc
INNER JOIN [AssociationDemo].[vwLegislativeBodies] lb 
  ON gc.LegislativeBodyID = lb.ID
WHERE gc.IsActive = 1
  AND lb.State IS NOT NULL
GROUP BY lb.State, lb.BodyType
ORDER BY lb.State, ContactCount DESC