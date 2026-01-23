SELECT 
    p.ID,
    p.Name AS ProductName,
    COUNT(pa.ID) AS GoldAwardCount,
    STRING_AGG(pa.AwardName, '; ') AS AwardNames,
    STRING_AGG(CAST(pa.Year AS NVARCHAR), ', ') AS AwardYears,
    MIN(pa.AwardDate) AS FirstGoldAward,
    MAX(pa.AwardDate) AS MostRecentGoldAward
FROM [AssociationDemo].[vwProducts] p
INNER JOIN [AssociationDemo].[vwProductAwards] pa ON p.ID = pa.ProductID
WHERE pa.AwardLevel = 'Gold'
    AND pa.IsDisplayed = 1
    {% if MinYear %}
    AND pa.Year >= {{ MinYear | sqlNumber }}
    {% endif %}
GROUP BY p.ID, p.Name
HAVING COUNT(pa.ID) >= {{ MinAwardCount | sqlNumber }}
ORDER BY GoldAwardCount DESC, MostRecentGoldAward DESC