-- Resource categories with highest average user ratings
-- Calculates weighted average rating per category with minimum rating threshold

SELECT 
    rc.ID,
    rc.Name AS CategoryName,
    rc.Description,
    COUNT(r.ID) AS ResourceCount,
    SUM(r.RatingCount) AS TotalRatings,
    -- Weighted average: sum of (avg rating * rating count) / total rating count
    CASE 
        WHEN SUM(r.RatingCount) > 0 
        THEN SUM(r.AverageRating * r.RatingCount) / SUM(r.RatingCount)
        ELSE 0 
    END AS WeightedAverageRating,
    -- Simple average of resource averages (for comparison)
    AVG(r.AverageRating) AS SimpleAverageRating,
    MIN(r.AverageRating) AS MinRating,
    MAX(r.AverageRating) AS MaxRating
FROM 
    [AssociationDemo].[vwResourceCategories] rc
    INNER JOIN [AssociationDemo].[vwResources] r ON rc.ID = r.CategoryID
WHERE 
    r.Status = 'Published'
    AND r.RatingCount > 0  -- Only include resources that have been rated
    {% if MinRatingCount %}
    AND r.RatingCount >= {{ MinRatingCount | sqlNumber }}
    {% endif %}
GROUP BY 
    rc.ID,
    rc.Name,
    rc.Description
HAVING 
    SUM(r.RatingCount) >= {{ MinCategoryRatings | sqlNumber }}  -- Minimum total ratings per category
ORDER BY 
    WeightedAverageRating DESC,
    TotalRatings DESC