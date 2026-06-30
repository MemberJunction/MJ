-- Aggregate stats matching the same filter universe as
-- ListConversationDetailFeedback (the row-level query). Used by the Agent
-- Feedback resource to populate the four stat cards (Total / Avg / %High /
-- %Low) — those need to reflect ALL filtered rows, not just the current page,
-- which is why this lives in a separate query rather than being denormalised
-- onto every paged row.
--
-- Parameters mirror the row query (StartDate, EndDate, MinRating, MaxRating,
-- AgentID, SearchText) — pass identical values so both queries describe the
-- same filtered set.
SELECT
    COUNT(*)                                                              AS Total,
    AVG(CAST(cd.UserRating AS FLOAT))                                     AS AvgRating,
    SUM(CASE WHEN cd.UserRating >= 8 THEN 1 ELSE 0 END)                   AS PositiveCount,
    SUM(CASE WHEN cd.UserRating <= 3 THEN 1 ELSE 0 END)                   AS NegativeCount
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
