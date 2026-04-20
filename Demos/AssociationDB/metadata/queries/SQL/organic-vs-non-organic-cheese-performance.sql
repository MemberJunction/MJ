-- Compare competition performance between organic and non-organic cheese products
-- Returns average scores, rankings, and award distribution for each group

SELECT 
    p.IsOrganic,
    CASE 
        WHEN p.IsOrganic = 1 THEN 'Organic'
        ELSE 'Non-Organic'
    END AS ProductType,
    COUNT(DISTINCT ce.ID) AS TotalEntries,
    COUNT(DISTINCT p.ID) AS UniqueProducts,
    AVG(ce.Score) AS AverageScore,
    AVG(CAST(ce.Ranking AS DECIMAL(10,2))) AS AverageRanking,
    MIN(ce.Score) AS MinScore,
    MAX(ce.Score) AS MaxScore,
    MIN(ce.Ranking) AS BestRanking,
    MAX(ce.Ranking) AS WorstRanking,
    SUM(CASE WHEN ce.AwardLevel = 'Best in Show' THEN 1 ELSE 0 END) AS BestInShowCount,
    SUM(CASE WHEN ce.AwardLevel = 'Gold' THEN 1 ELSE 0 END) AS GoldCount,
    SUM(CASE WHEN ce.AwardLevel = 'Silver' THEN 1 ELSE 0 END) AS SilverCount,
    SUM(CASE WHEN ce.AwardLevel = 'Bronze' THEN 1 ELSE 0 END) AS BronzeCount,
    SUM(CASE WHEN ce.AwardLevel = 'Finalist' THEN 1 ELSE 0 END) AS FinalistCount,
    SUM(CASE WHEN ce.AwardLevel = 'Honorable Mention' THEN 1 ELSE 0 END) AS HonorableMentionCount,
    SUM(CASE WHEN ce.AwardLevel = 'None' OR ce.AwardLevel IS NULL THEN 1 ELSE 0 END) AS NoAwardCount
FROM [AssociationDemo].[vwProducts] p
INNER JOIN [AssociationDemo].[vwCompetitionEntries] ce ON p.ID = ce.ProductID
WHERE ce.Status IN ('Judged', 'Winner', 'Finalist')
    AND ce.Score IS NOT NULL
GROUP BY p.IsOrganic
ORDER BY p.IsOrganic DESC