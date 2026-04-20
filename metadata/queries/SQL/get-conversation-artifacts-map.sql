-- Get Conversation Artifacts Map - Optimized for quick display with lazy loading
-- Returns basic artifact info for a conversation without loading full content
-- This query is optimized for performance by:
--   1. Using JOINs instead of separate queries
--   2. Excluding the Content field to reduce payload size
--   3. Filtering server-side for efficiency
SELECT
    cda.ConversationDetailID,
    cda.Direction,
    av.ID as ArtifactVersionID,
    av.VersionNumber,
    av.ArtifactID,
    a.Name as ArtifactName, 
    a.Type as ArtifactType, 
    a.Description as ArtifactDescription
FROM [__mj].[vwConversationDetailArtifacts] cda
INNER JOIN [__mj].[vwArtifactVersions] av ON cda.ArtifactVersionID = av.ID
INNER JOIN [__mj].[vwArtifacts] a ON av.ArtifactID = a.ID
INNER JOIN [__mj].[vwConversationDetails] cd ON cda.ConversationDetailID = cd.ID
WHERE cd.ConversationID = {{ ConversationID | sqlString }}
  AND cda.Direction = 'Output'
ORDER BY cda.__mj_CreatedAt, av.VersionNumber
