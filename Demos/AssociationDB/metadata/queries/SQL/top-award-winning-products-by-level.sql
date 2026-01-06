SELECT
    p.ID,
    p.Name AS ProductName,
    p.CheeseType,
    p.MilkSource,
    p.Category,
    COUNT(DISTINCT pa.ID) AS TotalAwards,
    SUM(CASE WHEN pa.AwardLevel = 'Best in Show' THEN 1 ELSE 0 END) AS BestInShowCount,
    SUM(CASE WHEN pa.AwardLevel = 'Gold' THEN 1 ELSE 0 END) AS GoldCount,
    SUM(CASE WHEN pa.AwardLevel = 'Silver' THEN 1 ELSE 0 END) AS SilverCount,
    SUM(CASE WHEN pa.AwardLevel = 'Bronze' THEN 1 ELSE 0 END) AS BronzeCount,
    STRING_AGG(DISTINCT pa.AwardingOrganization, ', ') AS AwardingOrganizations,
    MIN(pa.AwardDate) AS FirstAwardDate,
    MAX(pa.AwardDate) AS MostRecentAwardDate
FROM [AssociationDemo].[vwProducts] p
INNER JOIN [AssociationDemo].[vwProductAwards] pa ON p.ID = pa.ProductID
WHERE pa.IsDisplayed = 1
{% if MinAwardCount %}
    AND p.AwardCount >= {{ MinAwardCount | sqlNumber }}
{% endif %}
{% if StartYear %}
    AND pa.Year >= {{ StartYear | sqlNumber }}
{% endif %}
{% if EndYear %}
    AND pa.Year <= {{ EndYear | sqlNumber }}
{% endif %}
GROUP BY p.ID, p.Name, p.CheeseType, p.MilkSource, p.Category
ORDER BY TotalAwards DESC, BestInShowCount DESC, GoldCount DESC