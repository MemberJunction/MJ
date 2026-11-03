-- PostgreSQL variant: aggregate stats over the same filter universe as ListConversationDetailFeedback.
-- Mirrors list-conversation-detail-feedback-stats.sql. Differences:
--   * `[__mj].X` / `[User]` → `__mj."X"` / `"User"`; column names double-quoted, since PG folds
--     unquoted names to lower case.
--   * `LIKE` → `ILIKE`: the search is case-insensitive, which SQL Server's default collation gives
--     LIKE and PG's LIKE does not.
SELECT
    COUNT(*)                                                                  AS "Total",
    AVG(CAST(cd."UserRating" AS FLOAT))                                       AS "AvgRating",
    SUM(CASE WHEN cd."UserRating" >= 8 THEN 1 ELSE 0 END)                     AS "PositiveCount",
    SUM(CASE WHEN cd."UserRating" <= 3 THEN 1 ELSE 0 END)                     AS "NegativeCount"
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
