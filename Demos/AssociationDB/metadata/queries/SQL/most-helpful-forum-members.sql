SELECT 
    m.ID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Organization,
    m.Title,
    m.JobFunction,
    COUNT(fp.ID) AS AcceptedAnswerCount,
    MIN(fp.PostedDate) AS FirstAcceptedAnswerDate,
    MAX(fp.PostedDate) AS MostRecentAcceptedAnswerDate
FROM [AssociationDemo].[vwMembers] m
INNER JOIN [AssociationDemo].[vwForumPosts] fp ON m.ID = fp.AuthorID
WHERE fp.IsAcceptedAnswer = 1
    AND fp.Status = 'Published'
    {% if MinAnswerCount %}
    AND fp.ID IN (
        SELECT AuthorID 
        FROM [AssociationDemo].[vwForumPosts]
        WHERE IsAcceptedAnswer = 1 AND Status = 'Published'
        GROUP BY AuthorID
        HAVING COUNT(*) >= {{ MinAnswerCount | sqlNumber }}
    )
    {% endif %}
    {% if StartDate %}
    AND fp.PostedDate >= {{ StartDate | sqlDate }}
    {% endif %}
    {% if EndDate %}
    AND fp.PostedDate < {{ EndDate | sqlDate }}
    {% endif %}
GROUP BY m.ID, m.FirstName, m.LastName, m.Email, m.Organization, m.Title, m.JobFunction
ORDER BY AcceptedAnswerCount DESC