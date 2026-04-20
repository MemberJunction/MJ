SELECT 
    p.ID AS PostID,
    p.Content,
    p.AuthorID,
    p.PostedDate,
    p.ThreadID,
    p.Status AS PostStatus,
    COUNT(fm.ID) AS FlagCount,
    STRING_AGG(fm.ReportReason, '; ') AS ReportReasons
FROM [AssociationDemo].[vwForumPosts] p
INNER JOIN [AssociationDemo].[vwForumModerations] fm ON p.ID = fm.PostID
WHERE fm.ReportedDate >= {{ startDate | sqlDate }}
{% if minFlagCount %}
GROUP BY p.ID, p.Content, p.AuthorID, p.PostedDate, p.ThreadID, p.Status
HAVING COUNT(fm.ID) >= {{ minFlagCount | sqlNumber }}
{% else %}
GROUP BY p.ID, p.Content, p.AuthorID, p.PostedDate, p.ThreadID, p.Status
{% endif %}
ORDER BY FlagCount DESC