-- List Conversation Detail Feedback — 1-10 ratings + free-form comments left
-- on AI messages. Used by the Agent Feedback resource. Filtering happens
-- server-side; pagination is delegated to RunQuery via StartRow/MaxRows.
--
-- Parameters (all optional, all wired via Nunjucks):
--   StartDate  : ISO date string lower bound on __mj_UpdatedAt
--   EndDate    : ISO date string upper bound on __mj_UpdatedAt
--   MinRating  : integer 1-10 lower bound
--   MaxRating  : integer 1-10 upper bound
--   AgentID    : scope to a single agent
--   SearchText : case-insensitive substring match across comments, message,
--                agent name, rater name, and rater email
--
-- Storage: ratings live directly on __mj.ConversationDetail.UserRating +
-- UserFeedback (single rating per message). __mj_UpdatedAt is the "rated at"
-- timestamp.
--
-- Rater attribution: there is no per-rating "rated by" column. Server-side
-- write authorization (MJConversationDetailEntityExtended.currentUserMayWrite)
-- only allows the conversation owner to set UserRating/UserFeedback, so the
-- rater is — by definition — the parent conversation's owner. Joining the
-- User table via ConversationDetail.UserID (the message *sender*) would
-- attribute the rating to the AI message's owner (often the system or the
-- conversation owner depending on how the chat writes AI rows), which is
-- semantically wrong.
SELECT
    cd.ID                AS RatingID,
    cd.UserRating        AS Rating,
    cd.UserFeedback      AS Comments,
    cd.__mj_UpdatedAt    AS RatedAt,

    c.UserID             AS RaterUserID,
    cu.Name              AS RaterName,
    cu.Email             AS RaterEmail,

    cd.ID                AS ConversationDetailID,
    cd.ConversationID    AS ConversationID,
    cd.Message           AS MessageText,
    cd.Role              AS MessageRole,
    cd.__mj_CreatedAt    AS MessageCreatedAt,

    c.Name               AS ConversationName,

    cd.AgentID           AS AgentID,
    a.Name               AS AgentName
FROM [__mj].ConversationDetail cd
LEFT JOIN [__mj].Conversation   c  ON c.ID  = cd.ConversationID
LEFT JOIN [__mj].[User]         cu ON cu.ID = c.UserID
LEFT JOIN [__mj].AIAgent        a  ON a.ID  = cd.AgentID
WHERE cd.UserRating IS NOT NULL
    {% if StartDate %}
    AND cd.__mj_UpdatedAt >= {{ StartDate | sqlString }}
    {% endif %}
    {% if EndDate %}
    AND cd.__mj_UpdatedAt <= {{ EndDate | sqlString }}
    {% endif %}
    {% if MinRating %}
    AND cd.UserRating >= {{ MinRating }}
    {% endif %}
    {% if MaxRating %}
    AND cd.UserRating <= {{ MaxRating }}
    {% endif %}
    {% if AgentID %}
    AND cd.AgentID = {{ AgentID | sqlString }}
    {% endif %}
    {% if SearchText %}
    AND (
            cd.UserFeedback   LIKE {{ SearchText | sqlLikeContains }}
         OR cd.Message        LIKE {{ SearchText | sqlLikeContains }}
         OR a.Name            LIKE {{ SearchText | sqlLikeContains }}
         OR cu.Name           LIKE {{ SearchText | sqlLikeContains }}
         OR cu.Email          LIKE {{ SearchText | sqlLikeContains }}
    )
    {% endif %}
ORDER BY cd.__mj_UpdatedAt DESC
