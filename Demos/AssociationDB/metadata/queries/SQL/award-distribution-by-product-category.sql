-- Award Distribution By Product Category
-- Returns distribution of awards and no-awards across product categories
-- Includes entries with no awards to calculate award rates

SELECT 
    ce.Category AS CategoryName,
    COALESCE(ce.AwardLevel, 'No Award') AS AwardLevel,
    COUNT(ce.ID) AS EntryCount,
    SUM(COUNT(ce.ID)) OVER (PARTITION BY ce.CategoryID) AS CategoryTotalEntries,
    CAST(COUNT(ce.ID) AS DECIMAL(10,2)) / NULLIF(SUM(COUNT(ce.ID)) OVER (PARTITION BY ce.CategoryID), 0) * 100 AS PercentOfCategoryEntries
FROM [AssociationDemo].[vwCompetitionEntries] ce
INNER JOIN [AssociationDemo].[vwCompetitions] c ON ce.CompetitionID = c.ID
WHERE c.Status IN ('Completed', 'Judging')
    AND ce.Status IN ('Judged', 'Winner', 'Finalist')
GROUP BY ce.Category, ce.CategoryID, COALESCE(ce.AwardLevel, 'No Award')
ORDER BY ce.Category, 
    CASE COALESCE(ce.AwardLevel, 'No Award')
        WHEN 'Best in Show' THEN 1
        WHEN 'Gold' THEN 2
        WHEN 'Silver' THEN 3
        WHEN 'Bronze' THEN 4
        WHEN 'Finalist' THEN 5
        WHEN 'Honorable Mention' THEN 6
        WHEN 'No Award' THEN 7
        ELSE 8
    END