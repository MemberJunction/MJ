SELECT
    pr.ReactionType,
    COUNT(*) AS ReactionCount,
    COUNT(DISTINCT pr.MemberID) AS UniqueMembersReacting,
    COUNT(DISTINCT pr.PostID) AS AcceptedAnswersWithReaction,
    MIN(pr.CreatedDate) AS FirstReactionDate,
    MAX(pr.CreatedDate) AS LastReactionDate
FROM [AssociationDemo].[vwForumPosts] fp
INNER JOIN [AssociationDemo].[vwPostReactions] pr ON fp.ID = pr.PostID
WHERE fp.IsAcceptedAnswer = 1
    AND fp.Status = 'Published'
    {% if StartDate %}AND pr.CreatedDate >= {{ StartDate | sqlDate }}{% endif %}
    {% if EndDate %}AND pr.CreatedDate < {{ EndDate | sqlDate }}{% endif %}
GROUP BY pr.ReactionType
ORDER BY ReactionCount DESC