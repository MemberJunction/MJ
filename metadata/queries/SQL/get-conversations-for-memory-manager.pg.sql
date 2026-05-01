-- PostgreSQL variant: Get Conversations for Memory Manager - single optimized query
-- Mirrors get-conversations-for-memory-manager.sql for PG. Differences:
--   * `[__mj].[X]` → `__mj."X"` (schema brackets removed, view names quoted).
--   * Bare PascalCase columns double-quoted to survive PG's case-folding.
--   * `SELECT TOP 1 ...` → `SELECT ... LIMIT 1` (TOP is T-SQL only).
--   * `(SELECT ... FOR JSON PATH)` → `(SELECT json_agg(json_build_object(...))::text)`.
--   * `CASE WHEN EXISTS THEN 1 ELSE 0 END` → `(EXISTS(...))::int` for cleaner PG idiom.
SELECT
    c."ID" AS "ConversationID",
    c."UserID",

    -- Most recent agent run ID for this conversation (for scope inheritance)
    (
        SELECT ar."ID"
        FROM __mj."vwAIAgentRuns" ar
        WHERE ar."ConversationID" = c."ID"
          AND ar."AgentID" IN {{ agentIds | sqlIn }}
        ORDER BY ar."StartedAt" DESC
        LIMIT 1
    ) AS "AgentRunID",

    -- Conversation details as JSON array with ratings included
    (
        SELECT json_agg(json_build_object(
            'id', cd."ID",
            'role', cd."Role",
            'message', cd."Message",
            'createdAt', cd."__mj_CreatedAt",
            'rating', cdr."Rating",
            'ratingComment', cdr."Comments"
        ) ORDER BY cd."__mj_CreatedAt" ASC)::text
        FROM __mj."vwConversationDetails" cd
        LEFT OUTER JOIN __mj."vwConversationDetailRatings" cdr
            ON cdr."ConversationDetailID" = cd."ID"
        WHERE cd."ConversationID" = c."ID"
          AND cd."Status" = 'Complete'
    ) AS "MessagesJSON",

    -- Rating summary flags. PG returns booleans for EXISTS; cast to int to keep
    -- the consumer-side shape identical to the T-SQL `CASE ... THEN 1 ELSE 0`.
    (EXISTS (
        SELECT 1 FROM __mj."vwConversationDetails" cd
        INNER JOIN __mj."vwConversationDetailRatings" cdr ON cdr."ConversationDetailID" = cd."ID"
        WHERE cd."ConversationID" = c."ID" AND cdr."Rating" >= 8
    ))::int AS "HasPositiveRating",

    (EXISTS (
        SELECT 1 FROM __mj."vwConversationDetails" cd
        INNER JOIN __mj."vwConversationDetailRatings" cdr ON cdr."ConversationDetailID" = cd."ID"
        WHERE cd."ConversationID" = c."ID" AND cdr."Rating" <= 3
    ))::int AS "HasNegativeRating",

    (NOT EXISTS (
        SELECT 1 FROM __mj."vwConversationDetails" cd
        INNER JOIN __mj."vwConversationDetailRatings" cdr ON cdr."ConversationDetailID" = cd."ID"
        WHERE cd."ConversationID" = c."ID"
    ))::int AS "IsUnrated"

FROM __mj."vwConversations" c

-- Only include conversations with new activity since last run
WHERE EXISTS (
    SELECT 1 FROM __mj."vwConversationDetails" cd_new
    WHERE cd_new."ConversationID" = c."ID"
    {% if since %}
    AND cd_new."__mj_CreatedAt" >= '{{ since }}'
    {% endif %}
)

-- Only include conversations linked to agents that have memory enabled
AND EXISTS (
    SELECT 1 FROM __mj."vwAIAgentRuns" ar
    WHERE ar."ConversationID" = c."ID"
      AND ar."AgentID" IN {{ agentIds | sqlIn }}
)

ORDER BY c."__mj_UpdatedAt" DESC
