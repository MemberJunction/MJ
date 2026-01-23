SELECT 
  p.CheeseType,
  CASE WHEN p.IsOrganic = 1 THEN 'Organic' ELSE 'Non-Organic' END AS OrganicStatus,
  COUNT(p.ID) AS ProductCount,
  AVG(p.RetailPrice) AS AvgRetailPrice,
  MIN(p.RetailPrice) AS MinRetailPrice,
  MAX(p.RetailPrice) AS MaxRetailPrice,
  SUM(CASE WHEN p.RetailPrice IS NOT NULL THEN 1 ELSE 0 END) AS ProductsWithPrice
FROM [AssociationDemo].[vwProducts] p
WHERE p.CheeseType IS NOT NULL
  AND p.Status = 'Active'
  {% if StartDate %}
  AND p.DateIntroduced >= {{ StartDate | sqlDate }}
  {% endif %}
  {% if EndDate %}
  AND p.DateIntroduced <= {{ EndDate | sqlDate }}
  {% endif %}
GROUP BY p.CheeseType, p.IsOrganic
ORDER BY p.CheeseType, p.IsOrganic DESC