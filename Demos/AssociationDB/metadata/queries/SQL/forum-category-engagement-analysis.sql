WITH CategoryHierarchy AS (
    SELECT 
        fc.ID,
        fc.Name,
        fc.ParentCategoryID,
        fc.ThreadCount,
        fc.PostCount,
        fc.LastPostDate,
        fc.IsActive,
        CASE 
            WHEN fc.ParentCategoryID IS NULL THEN 'Parent'
            ELSE 'Subcategory'
        END AS CategoryLevel
    FROM [AssociationDemo].[vwForumCategories] fc
    WHERE fc.IsActive = 1
),
ParentMetrics AS (
    SELECT 
        ch.ID AS ParentCategoryID,
        ch.Name AS ParentCategoryName,
        ch.ThreadCount AS ParentThreadCount,
        ch.PostCount AS ParentPostCount,
        ch.LastPostDate AS ParentLastPostDate,
        COUNT(sub.ID) AS SubcategoryCount,
        COALESCE(SUM(sub.ThreadCount), 0) AS SubcategoryTotalThreads,
        COALESCE(SUM(sub.PostCount), 0) AS SubcategoryTotalPosts,
        MAX(sub.LastPostDate) AS SubcategoryLastPostDate
    FROM CategoryHierarchy ch
    LEFT JOIN CategoryHierarchy sub ON ch.ID = sub.ParentCategoryID
    WHERE ch.CategoryLevel = 'Parent'
    GROUP BY ch.ID, ch.Name, ch.ThreadCount, ch.PostCount, ch.LastPostDate
)
SELECT 
    pm.ParentCategoryID,
    pm.ParentCategoryName,
    pm.ParentThreadCount,
    pm.ParentPostCount,
    pm.ParentLastPostDate,
    pm.SubcategoryCount,
    pm.SubcategoryTotalThreads,
    pm.SubcategoryTotalPosts,
    pm.SubcategoryLastPostDate,
    (pm.ParentThreadCount + pm.SubcategoryTotalThreads) AS TotalThreads,
    (pm.ParentPostCount + pm.SubcategoryTotalPosts) AS TotalPosts,
    CASE 
        WHEN COALESCE(pm.SubcategoryLastPostDate, '1900-01-01') > COALESCE(pm.ParentLastPostDate, '1900-01-01') 
        THEN pm.SubcategoryLastPostDate
        ELSE pm.ParentLastPostDate
    END AS MostRecentActivity
FROM ParentMetrics pm
ORDER BY TotalPosts DESC, TotalThreads DESC