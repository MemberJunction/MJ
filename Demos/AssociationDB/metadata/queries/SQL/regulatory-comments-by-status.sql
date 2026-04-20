-- Count regulatory comments by workflow status
-- Filters to Draft and Submitted statuses only
SELECT 
    rc.Status,
    COUNT(rc.ID) AS CommentCount
FROM [AssociationDemo].[vwRegulatoryComments] rc
WHERE rc.Status IN ('Draft', 'Submitted')
GROUP BY rc.Status
ORDER BY rc.Status