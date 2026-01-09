SELECT TOP 10
    ft.ID,
    ft.Title,
    ft.Category,
    ft.AuthorID,
    ft.CreatedDate,
    ft.ReplyCount,
    ft.ViewCount,
    ft.LastActivityDate,
    ft.LastReplyAuthorID,
    (ft.ReplyCount + ft.ViewCount) AS EngagementScore
FROM [AssociationDemo].[vwForumThreads] ft
WHERE ft.LastActivityDate >= DATEADD(DAY, -30, GETDATE())
    AND ft.Status = 'Active'
ORDER BY EngagementScore DESC