-- PostgreSQL variant: Get Conversation Complete - single-query conversation load
-- Mirrors get-conversation-complete.sql for PG. Differences:
--   * `[__mj].[X]` → `__mj."X"` (schema brackets removed, view name double-quoted).
--   * Bare PascalCase column refs double-quoted to survive PG's case-folding.
--   * `(SELECT ... FOR JSON PATH)` rewritten as
--     `(SELECT json_agg(json_build_object(...)) FROM ...)` which produces an
--     equivalent JSON-array shape. Output cast to text via `::text` so consumers
--     that previously received a JSON string keep receiving a JSON string
--     (T-SQL FOR JSON PATH returns a string, not an array of rows).
--   * `cd.*` is preserved as-is — PG's SELECT * doesn't need quoting per-column.
SELECT
    -- Conversation Detail fields (all fields needed for display)
    cd.*,

    -- User Avatar fields from vwUsers (for message display)
    u."UserImageURL",
    u."UserImageIconClass",

    -- Agent Runs as JSON array (0-1 per conversation detail)
    (
        SELECT json_agg(json_build_object(
            'ID', ar."ID",
            'AgentID', ar."AgentID",
            'Agent', ar."Agent",
            'Status', ar."Status",
            '__mj_CreatedAt', ar."__mj_CreatedAt",
            '__mj_UpdatedAt', ar."__mj_UpdatedAt",
            'TotalPromptTokensUsed', ar."TotalPromptTokensUsed",
            'TotalCompletionTokensUsed', ar."TotalCompletionTokensUsed",
            'TotalCost', ar."TotalCost",
            'ConversationDetailID', ar."ConversationDetailID"
        ))::text
        FROM __mj."vwAIAgentRuns" ar
        WHERE ar."ConversationDetailID" = cd."ID"
    ) AS "AgentRunsJSON",

    -- Artifacts as JSON array (0-N per conversation detail)
    -- Excludes heavy Content field for performance.
    (
        SELECT json_agg(json_build_object(
            'ConversationDetailID', cda."ConversationDetailID",
            'Direction', cda."Direction",
            'ArtifactVersionID', av."ID",
            'VersionNumber', av."VersionNumber",
            'VersionName', av."Name",
            'VersionDescription', av."Description",
            'VersionCreatedAt', av."__mj_CreatedAt",
            'ArtifactID', av."ArtifactID",
            'ArtifactName', a."Name",
            'ArtifactType', a."Type",
            'ArtifactDescription', a."Description",
            'Visibility', a."Visibility"
        ) ORDER BY cda."__mj_CreatedAt", av."VersionNumber")::text
        FROM __mj."vwConversationDetailArtifacts" cda
        INNER JOIN __mj."vwArtifactVersions" av ON cda."ArtifactVersionID" = av."ID"
        INNER JOIN __mj."vwArtifacts" a ON av."ArtifactID" = a."ID"
        WHERE cda."ConversationDetailID" = cd."ID"
          AND cda."Direction" = 'Output'
    ) AS "ArtifactsJSON",

    -- Ratings as JSON array (0-N per conversation detail)
    (
        SELECT json_agg(json_build_object(
            'ID', cdr."ID",
            'UserID', cdr."UserID",
            'Rating', cdr."Rating",
            'Comments', cdr."Comments",
            '__mj_CreatedAt', cdr."__mj_CreatedAt",
            'UserName', u2."Name"
        ) ORDER BY cdr."__mj_CreatedAt" DESC)::text
        FROM __mj."vwConversationDetailRatings" cdr
        INNER JOIN __mj."vwUsers" u2 ON cdr."UserID" = u2."ID"
        WHERE cdr."ConversationDetailID" = cd."ID"
    ) AS "RatingsJSON"

FROM __mj."vwConversationDetails" cd
LEFT OUTER JOIN __mj."vwUsers" u ON cd."UserID" = u."ID"
WHERE cd."ConversationID" = {{ ConversationID | sqlString }}
ORDER BY cd."__mj_CreatedAt" ASC
