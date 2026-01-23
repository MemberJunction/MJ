WITH ResourceEngagement AS (
  SELECT 
    r.ID,
    r.Title,
    r.ResourceType,
    r.Category,
    r.DownloadCount,
    r.AverageRating,
    r.RatingCount,
    -- Calculate weighted engagement score
    (r.DownloadCount + (r.AverageRating * r.RatingCount * 10)) AS EngagementScore
  FROM [AssociationDemo].[vwResources] r
  WHERE r.Status = 'Published'
),
ResourceTagsAgg AS (
  SELECT 
    rt.ResourceID,
    STRING_AGG(rt.TagName, ', ') AS Tags,
    COUNT(rt.ID) AS TagCount
  FROM [AssociationDemo].[vwResourceTags] rt
  GROUP BY rt.ResourceID
)
SELECT TOP {{ topN | sqlNumber }}
  re.ID,
  re.Title,
  re.ResourceType,
  re.Category,
  re.DownloadCount,
  re.AverageRating,
  re.RatingCount,
  re.EngagementScore,
  COALESCE(rta.Tags, '') AS Tags,
  COALESCE(rta.TagCount, 0) AS TagCount
FROM ResourceEngagement re
LEFT JOIN ResourceTagsAgg rta ON re.ID = rta.ResourceID
WHERE re.EngagementScore > 0
  {% if MinDownloads %}AND re.DownloadCount >= {{ MinDownloads | sqlNumber }}{% endif %}
  {% if MinRating %}AND re.AverageRating >= {{ MinRating | sqlNumber }}{% endif %}
ORDER BY re.EngagementScore DESC