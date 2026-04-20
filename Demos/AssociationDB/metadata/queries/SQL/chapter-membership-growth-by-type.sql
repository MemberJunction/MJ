SELECT 
    c.ChapterType,
    COUNT(DISTINCT cm.MemberID) AS NewMembers,
    MIN(cm.JoinDate) AS FirstJoinDate,
    MAX(cm.JoinDate) AS LastJoinDate
FROM [AssociationDemo].[vwChapterMemberships] cm
INNER JOIN [AssociationDemo].[vwChapters] c ON cm.ChapterID = c.ID
WHERE cm.JoinDate >= DATEADD(YEAR, -1, GETDATE())
    AND cm.Status = 'Active'
GROUP BY c.ChapterType
ORDER BY NewMembers DESC