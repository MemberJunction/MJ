-- Resources with highest download-to-view conversion rates and quality ratings
SELECT 
    r.ID,
    r.Title,
    r.ResourceType,
    r.Category,
    r.ViewCount,
    r.DownloadCount,
    CAST(r.DownloadCount AS FLOAT) / NULLIF(r.ViewCount, 0) AS DownloadToViewRatio,
    r.AverageRating,
    r.RatingCount,
    r.PublishedDate,
    r.IsFeatured,
    r.RequiresMembership
FROM [AssociationDemo].[vwResources] r
WHERE r.Status = 'Published'
    AND r.ViewCount >= {{ minViews | sqlNumber }}
    AND r.DownloadCount > 0
{% if resourceType %}
    AND r.ResourceType = {{ resourceType | sqlString }}
{% endif %}
{% if categoryID %}
    AND r.CategoryID = {{ categoryID | sqlString }}
{% endif %}
ORDER BY DownloadToViewRatio DESC