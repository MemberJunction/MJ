-- Get Conversation Complete - Single optimized query for conversation loading
-- Returns ALL data needed to display a conversation: messages, agent runs, and artifacts
-- Uses JSON aggregation to include related data without row multiplication
-- This replaces 4 separate queries with 1 query for ~70% performance improvement
SELECT
    -- Conversation Detail fields (all fields needed for display)
    cd.*,

    -- User Avatar fields from vwUsers (for message display)
    -- These fields come from the LEFT JOIN to User table in vwConversationDetails
    u.UserImageURL,
    u.UserImageIconClass,

    -- Agent Runs as JSON array (0-1 per conversation detail)
    -- Only includes fields needed for display in the gear icon
    (
        SELECT
            ar.ID, 
            ar.AgentID,
            ar.Agent,
            ar.Status,
            ar.__mj_CreatedAt,
            ar.__mj_UpdatedAt,
            ar.TotalPromptTokensUsed,
            ar.TotalCompletionTokensUsed,
            ar.TotalCost,
            ar.ConversationDetailID
        FROM [__mj].[vwAIAgentRuns] ar
        WHERE ar.ConversationDetailID = cd.ID
        FOR JSON PATH
    ) as AgentRunsJSON,

    -- Artifacts as JSON array (0-N per conversation detail)
    -- Only includes fields needed for display in artifact cards
    -- Excludes heavy Content field for performance
    (
        SELECT
            cda.ConversationDetailID,
            cda.Direction,
            av.ID as ArtifactVersionID,
            av.VersionNumber,
            av.Name as VersionName,
            av.Description as VersionDescription,
            av.__mj_CreatedAt as VersionCreatedAt,
            av.ArtifactID,
            a.Name as ArtifactName,
            a.Type as ArtifactType,
            a.Description as ArtifactDescription,
            a.Visibility as Visibility
        FROM [__mj].[vwConversationDetailArtifacts] cda
        INNER JOIN [__mj].[vwArtifactVersions] av ON cda.ArtifactVersionID = av.ID
        INNER JOIN [__mj].[vwArtifacts] a ON av.ArtifactID = a.ID
        WHERE cda.ConversationDetailID = cd.ID
          AND cda.Direction = 'Output'
        ORDER BY cda.__mj_CreatedAt, av.VersionNumber
        FOR JSON PATH
    ) as ArtifactsJSON,

    -- Ratings as JSON array (0-N per conversation detail)
    -- Includes all user ratings for multi-user support
    (
        SELECT
            cdr.ID,
            cdr.UserID,
            cdr.Rating,
            cdr.Comments,
            cdr.__mj_CreatedAt,
            u.Name as UserName
        FROM [__mj].[vwConversationDetailRatings] cdr
        INNER JOIN [__mj].[vwUsers] u ON cdr.UserID = u.ID
        WHERE cdr.ConversationDetailID = cd.ID
        ORDER BY cdr.__mj_CreatedAt DESC
        FOR JSON PATH
    ) as RatingsJSON

FROM [__mj].[vwConversationDetails] cd
LEFT OUTER JOIN [__mj].[vwUsers] u ON cd.UserID = u.ID
WHERE cd.ConversationID = {{ ConversationID | sqlString }}
ORDER BY cd.__mj_CreatedAt ASC
