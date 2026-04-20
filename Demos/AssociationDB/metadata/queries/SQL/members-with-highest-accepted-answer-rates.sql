WITH AuthorStats AS (
    SELECT 
        fp.AuthorID,
        COUNT(*) AS TotalPosts,
        SUM(CASE WHEN fp.IsAcceptedAnswer = 1 THEN 1 ELSE 0 END) AS AcceptedAnswerCount
    FROM [AssociationDemo].[vwForumPosts] fp
    INNER JOIN [AssociationDemo].[vwForumThreads] ft ON fp.ThreadID = ft.ID
    WHERE fp.Status = 'Published'
    GROUP BY fp.AuthorID
    HAVING COUNT(*) >= {{ minPosts | sqlNumber }}
)
SELECT TOP {{ topN | sqlNumber }}
    a.AuthorID,
    a.TotalPosts,
    a.AcceptedAnswerCount
FROM AuthorStats a
ORDER BY 
    CAST(a.AcceptedAnswerCount AS FLOAT) / NULLIF(a.TotalPosts, 0) DESC,
    a.AcceptedAnswerCount DESC