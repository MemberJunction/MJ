SELECT 
  p.CheeseType,
  p.IsOrganic,
  CASE WHEN p.IsOrganic = 1 THEN 'Organic' ELSE 'Non-Organic' END AS OrganicStatus,
  COUNT(p.ID) AS ProductCount,
  AVG(p.RetailPrice) AS AvgRetailPrice,
  MIN(p.RetailPrice) AS MinRetailPrice,
  MAX(p.RetailPrice) AS MaxRetailPrice
FROM [AssociationDemo].[vwProducts] p
WHERE p.CheeseType IS NOT NULL
  AND p.RetailPrice IS NOT NULL
  AND p.Status = 'Active'
GROUP BY p.CheeseType, p.IsOrganic
ORDER BY p.CheeseType, p.IsOrganic DESC