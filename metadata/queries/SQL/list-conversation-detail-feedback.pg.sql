-- PostgreSQL variant: List Conversation Detail Feedback — 1-10 ratings + free-form comments left on AI
-- messages. The parameters and rater attribution are documented in list-conversation-detail-feedback.sql.
-- Mirrors list-conversation-detail-feedback.sql. Differences:
--   * `[__mj].X` / `[User]` → `__mj."X"` / `"User"`; column names double-quoted, since PG folds
--     unquoted names to lower case.
--   * `LIKE` → `ILIKE`: the search is case-insensitive, which SQL Server's default collation gives
--     LIKE and PG's LIKE does not.
SELECT
    cd."ID"                AS "RatingID",
    cd."UserRating"        AS "Rating",
    cd."UserFeedback"      AS "Comments",
    cd."__mj_UpdatedAt"    AS "RatedAt",

    c."UserID"             AS "RaterUserID",
    cu."Name"              AS "RaterName",
    cu."Email"             AS "RaterEmail",

    cd."ID"                AS "ConversationDetailID",
    cd."ConversationID"    AS "ConversationID",
    cd."Message"           AS "MessageText",
    cd."Role"              AS "MessageRole",
    cd."__mj_CreatedAt"    AS "MessageCreatedAt",

    c."Name"               AS "ConversationName",

    cd."AgentID"           AS "AgentID",
    a."Name"               AS "AgentName"
FROM __mj."ConversationDetail" cd
LEFT JOIN __mj."Conversation" c  ON c."ID"  = cd."ConversationID"
LEFT JOIN __mj."User"         cu ON cu."ID" = c."UserID"
LEFT JOIN __mj."AIAgent"      a  ON a."ID"  = cd."AgentID"
WHERE cd."UserRating" IS NOT NULL
    {% if StartDate %}
    AND cd."__mj_UpdatedAt" >= {{ StartDate | sqlString }}
    {% endif %}
    {% if EndDate %}
    AND cd."__mj_UpdatedAt" <= {{ EndDate | sqlString }}
    {% endif %}
    {% if MinRating %}
    AND cd."UserRating" >= {{ MinRating }}
    {% endif %}
    {% if MaxRating %}
    AND cd."UserRating" <= {{ MaxRating }}
    {% endif %}
    {% if AgentID %}
    AND cd."AgentID" = {{ AgentID | sqlString }}
    {% endif %}
    {% if SearchText %}
    AND (
            cd."UserFeedback" ILIKE {{ SearchText | sqlLikeContains }}
         OR cd."Message"      ILIKE {{ SearchText | sqlLikeContains }}
         OR a."Name"          ILIKE {{ SearchText | sqlLikeContains }}
         OR cu."Name"         ILIKE {{ SearchText | sqlLikeContains }}
         OR cu."Email"        ILIKE {{ SearchText | sqlLikeContains }}
    )
    {% endif %}
ORDER BY cd."__mj_UpdatedAt" DESC
