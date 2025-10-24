-- Get Conversation Artifacts For Agent
-- Returns all OUTPUT artifacts with their versions and configurations for AI agent requests
-- Includes Configuration field needed to extract component specs for modification workflows
--
-- Parameters:
--   ConversationID (required): The conversation to get artifacts from
--   AgentID (optional): Filter to only artifacts created by this specific agent ID
--
-- This query is optimized for building artifact context for AI agent API requests,
-- particularly for modification workflows where the agent needs to know what components exist.

SELECT DISTINCT
    a.ID as ArtifactID,
    a.Name as ArtifactName,
    a.Description as ArtifactDescription,
    a.Type as ArtifactType,
    a.Visibility as SharingScope,
    a.Comments,
    a.__mj_CreatedAt as ArtifactCreatedAt,
    a.__mj_UpdatedAt as ArtifactUpdatedAt,

    -- Artifact Type details
    at.ID as ArtifactTypeID,
    at.Name as ArtifactTypeName,
    at.Description as ArtifactTypeDescription,
    at.ContentType as ArtifactTypeContentType,
    at.__mj_CreatedAt as ArtifactTypeCreatedAt,
    at.__mj_UpdatedAt as ArtifactTypeUpdatedAt,

    -- All versions for this artifact as JSON array (sorted by version number)
    -- INCLUDES Configuration field for component spec extraction
    (
        SELECT
            av.ID,
            av.ArtifactID,
            av.VersionNumber as Version,
            av.Configuration,  -- Contains SkipAPIAnalysisCompleteResponse for Skip artifacts
            av.Content,        -- Contains the actual component/report content
            av.__mj_CreatedAt as CreatedAt,
            av.__mj_UpdatedAt as UpdatedAt
        FROM [__mj].[vwArtifactVersions] av
        WHERE av.ArtifactID = a.ID
        ORDER BY av.VersionNumber ASC
        FOR JSON PATH
    ) as VersionsJSON

FROM [__mj].[vwConversationDetailArtifacts] cda
INNER JOIN [__mj].[vwArtifactVersions] av ON cda.ArtifactVersionID = av.ID
INNER JOIN [__mj].[vwArtifacts] a ON av.ArtifactID = a.ID
INNER JOIN [__mj].[vwArtifactTypes] at ON a.TypeID = at.ID
INNER JOIN [__mj].[vwConversationDetails] cd ON cda.ConversationDetailID = cd.ID

WHERE cd.ConversationID = {{ ConversationID | sqlString }}
  AND cda.Direction = 'Output'  -- Only artifacts produced by agents (not inputs)
  {% if AgentID %}
  AND cd.AgentID = {{ AgentID | sqlString }}  -- Optional: filter by specific agent ID
  {% endif %}

-- Group by artifact to avoid duplicates (same artifact might be linked to multiple conversation details)
GROUP BY
    a.ID, a.Name, a.Description, a.Type, a.Visibility, a.Comments,
    a.__mj_CreatedAt, a.__mj_UpdatedAt,
    at.ID, at.Name, at.Description, at.ContentType, at.__mj_CreatedAt, at.__mj_UpdatedAt

ORDER BY a.__mj_CreatedAt ASC
