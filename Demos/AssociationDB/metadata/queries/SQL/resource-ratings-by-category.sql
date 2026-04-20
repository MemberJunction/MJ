SELECT 
  r.Category,
  r.CategoryID,
  COUNT(DISTINCT rr.ID) AS TotalReviews,
  COUNT(DISTINCT rr.MemberID) AS UniqueReviewers,
  AVG(CAST(rr.Rating AS DECIMAL(10,2))) AS AverageRating,
  SUM(CASE WHEN rr.Rating = 5 THEN 1 ELSE 0 END) AS FiveStarCount,
  SUM(CASE WHEN rr.Rating = 4 THEN 1 ELSE 0 END) AS FourStarCount,
  SUM(CASE WHEN rr.Rating = 3 THEN 1 ELSE 0 END) AS ThreeStarCount,
  SUM(CASE WHEN rr.Rating = 2 THEN 1 ELSE 0 END) AS TwoStarCount,
  SUM(CASE WHEN rr.Rating = 1 THEN 1 ELSE 0 END) AS OneStarCount,
  SUM(CASE WHEN rr.Review IS NOT NULL AND LEN(rr.Review) > 0 THEN 1 ELSE 0 END) AS ReviewsWithComments,
  COUNT(DISTINCT r.ID) AS TotalResources,
  MIN(rr.CreatedDate) AS FirstReviewDate,
  MAX(rr.CreatedDate) AS MostRecentReviewDate
FROM [AssociationDemo].[vwResources] r
INNER JOIN [AssociationDemo].[vwResourceRatings] rr ON r.ID = rr.ResourceID
WHERE r.Status = 'Published'
  {% if MinRating %}AND rr.Rating >= {{ MinRating | sqlNumber }}{% endif %}
  {% if StartDate %}AND rr.CreatedDate >= {{ StartDate | sqlDate }}{% endif %}
  {% if EndDate %}AND rr.CreatedDate < {{ EndDate | sqlDate }}{% endif %}
GROUP BY r.Category, r.CategoryID
ORDER BY TotalReviews DESC, UniqueReviewers DESC, AverageRating DESC