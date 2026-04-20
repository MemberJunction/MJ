SELECT
  CASE WHEN p.IsOrganic = 1 THEN 'Organic' ELSE 'Non-Organic' END AS ProductType,
  COUNT(p.ID) AS ProductCount,
  AVG(p.RetailPrice) AS AverageRetailPrice,
  MIN(p.RetailPrice) AS MinRetailPrice,
  MAX(p.RetailPrice) AS MaxRetailPrice
FROM [AssociationDemo].[vwProducts] p
WHERE p.IsAwardWinner = 1
  AND p.RetailPrice IS NOT NULL
GROUP BY p.IsOrganic
ORDER BY p.IsOrganic DESC