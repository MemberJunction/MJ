SELECT 
    pc.ID AS CategoryID,
    pc.Name AS CategoryName,
    pc.ParentCategory,
    COUNT(p.ID) AS AwardWinningProductCount,
    SUM(p.AwardCount) AS TotalAwards,
    STRING_AGG(p.Name, ', ') AS ProductNames
FROM [AssociationDemo].[vwProductCategories] pc
INNER JOIN [AssociationDemo].[vwProducts] p 
    ON pc.ID = p.CategoryID
WHERE p.IsAwardWinner = 1
    AND p.Status = 'Active'
GROUP BY 
    pc.ID,
    pc.Name,
    pc.ParentCategory
ORDER BY AwardWinningProductCount DESC, TotalAwards DESC