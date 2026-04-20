SELECT 
    pt.TagName,
    COUNT(pt.ID) AS UsageCount,
    COUNT(DISTINCT pt.PostID) AS UniquePostsTagged,
    MIN(pt.CreatedDate) AS FirstUsed,
    MAX(pt.CreatedDate) AS LastUsed
FROM [AssociationDemo].[vwPostTags] pt
GROUP BY pt.TagName
ORDER BY UsageCount DESC