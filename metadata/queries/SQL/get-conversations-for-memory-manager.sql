-- Get Conversations for Memory Manager - Single optimized query
-- Returns all data needed for memory extraction: conversations, details, ratings, and agent runs
-- Uses JSON aggregation to include related data without row multiplication
-- This replaces 4 separate queries with 1 query for better performance
--
-- Parameters:
--   @since (optional): ISO date string - only include conversations with new activity after this date
--   @agentIds: Array of agent IDs that have memory enabled (rendered via sqlIn filter)

SELECT
    c.ID as ConversationID,
    c.UserID,

    -- Most recent agent run ID for this conversation (for scope inheritance)
    (
        SELECT TOP 1 ar.ID
        FROM [__mj].[vwAIAgentRuns] ar
        WHERE ar.ConversationID = c.ID
        AND ar.AgentID IN {{ agentIds | sqlIn }}
        ORDER BY ar.StartedAt DESC
    ) as AgentRunID,

    -- Conversation details as JSON array with ratings included
    (
        SELECT
            cd.ID as id,
            cd.Role as role,
            cd.Message as message,
            cd.__mj_CreatedAt as createdAt,
            cdr.Rating as rating,
            cdr.Comments as ratingComment
        FROM [__mj].[vwConversationDetails] cd
        LEFT OUTER JOIN [__mj].[vwConversationDetailRatings] cdr
            ON cdr.ConversationDetailID = cd.ID
        WHERE cd.ConversationID = c.ID
        AND cd.Status = 'Complete'
        ORDER BY cd.__mj_CreatedAt ASC
        FOR JSON PATH
    ) as MessagesJSON,

    -- Rating summary flags
    CASE WHEN EXISTS (
        SELECT 1 FROM [__mj].[vwConversationDetails] cd
        INNER JOIN [__mj].[vwConversationDetailRatings] cdr ON cdr.ConversationDetailID = cd.ID
        WHERE cd.ConversationID = c.ID AND cdr.Rating >= 8
    ) THEN 1 ELSE 0
END as HasPositiveRating,

    CASE WHEN EXISTS (
        SELECT 1 FROM [__mj].[vwConversationDetails] cd
        INNER JOIN [__mj].[vwConversationDetailRatings] cdr ON cdr.ConversationDetailID = cd.ID
        WHERE cd.ConversationID = c.ID AND cdr.Rating <= 3
    ) THEN 1 ELSE 0
END as HasNegativeRating,

    CASE WHEN NOT EXISTS (
        SELECT 1 FROM [__mj].[vwConversationDetails] cd
        INNER JOIN [__mj].[vwConversationDetailRatings] cdr ON cdr.ConversationDetailID = cd.ID
        WHERE cd.ConversationID = c.ID
    ) THEN 1 ELSE 0
END as IsUnrated

FROM [__mj].[vwConversations] c

-- Only include conversations with new activity since last run
WHERE EXISTS (
    SELECT 1 FROM [__mj].[vwConversationDetails] cd_new
    WHERE cd_new.ConversationID = c.ID
    {% if since %}
    AND cd_new.__mj_CreatedAt >= '{{ since }}'
    {% endif %}
)

-- Only include conversations linked to agents that have memory enabled
AND EXISTS (
    SELECT 1 FROM [__mj].[vwAIAgentRuns] ar
    WHERE ar.ConversationID = c.ID
    AND ar.AgentID IN {{ agentIds | sqlIn }}
)

ORDER BY c.__mj_UpdatedAt DESC
