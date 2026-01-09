SELECT 
    ce.ProductID,
    ce.Product AS ProductName,
    COUNT(pa.ID) AS TotalAwards,
    SUM(CASE WHEN pa.AwardLevel = 'Best in Show' THEN 1 ELSE 0 END) AS BestInShowCount,
    SUM(CASE WHEN pa.AwardLevel = 'Gold' THEN 1 ELSE 0 END) AS GoldCount,
    SUM(CASE WHEN pa.AwardLevel = 'Silver' THEN 1 ELSE 0 END) AS SilverCount,
    SUM(CASE WHEN pa.AwardLevel = 'Bronze' THEN 1 ELSE 0 END) AS BronzeCount,
    MIN(pa.AwardDate) AS FirstAwardDate,
    MAX(pa.AwardDate) AS MostRecentAwardDate
FROM [AssociationDemo].[vwProductAwards] pa
INNER JOIN [AssociationDemo].[vwCompetitionEntries] ce ON pa.CompetitionEntryID = ce.ID
WHERE pa.IsDisplayed = 1
{% if MinYear %}
    AND pa.Year >= {{ MinYear | sqlNumber }}
{% endif %}
{% if MaxYear %}
    AND pa.Year <= {{ MaxYear | sqlNumber }}
{% endif %}
GROUP BY ce.ProductID, ce.Product
HAVING COUNT(pa.ID) >= {{ MinAwards | sqlNumber }}
ORDER BY TotalAwards DESC, BestInShowCount DESC, GoldCount DESC