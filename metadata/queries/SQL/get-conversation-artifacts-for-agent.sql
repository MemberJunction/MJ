-- Get Conversation Artifacts For Agent
-- Returns all OUTPUT artifacts with their versions and configurations for AI agent requests
-- Includes Configuration field needed to extract component specs for modification workflows
--
-- Parameters:
--   ConversationID (required): The conversation to get artifacts from
--   AgentID (optional): Filter to only artifacts created by this specific agent ID
--
-- This query returns a flat result set with one row per artifact version, including the
-- ConversationDetailID that created each version. The SDK groups these into artifacts with versions.

SELECT
    -- Artifact fields
    a.ID as ArtifactID,
    a.Name as ArtifactName,
    a.Description as ArtifactDescription,
    a.Type as ArtifactType, 
    a.Visibility as SharingScope,
    a.Comments as ArtifactComments,
    a.__mj_CreatedAt as ArtifactCreatedAt,
    a.__mj_UpdatedAt as ArtifactUpdatedAt,

    -- Artifact Type details
    at.ID as ArtifactTypeID,
    at.Name as ArtifactTypeName,
    at.Description as ArtifactTypeDescription,
    at.ContentType as ArtifactTypeContentType,
    at.__mj_CreatedAt as ArtifactTypeCreatedAt,
    at.__mj_UpdatedAt as ArtifactTypeUpdatedAt,

    -- Version fields
    av.ID as VersionID,
    av.VersionNumber as Version,
    av.Configuration,
    av.Content,
    av.Comments as VersionComments,
    av.__mj_CreatedAt as VersionCreatedAt,
    av.__mj_UpdatedAt as VersionUpdatedAt,

    -- ConversationDetailID that created this version (from join table)
    cda.ConversationDetailID

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

ORDER BY a.__mj_CreatedAt ASC, av.VersionNumber ASC
