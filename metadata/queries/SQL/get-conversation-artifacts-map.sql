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
INNER JOIN [__mj].[vwConversations] conv ON cd.ConversationID = conv.ID
WHERE cd.ConversationID = {{ ConversationID | sqlString }}
  AND cda.Direction = 'Output'
  AND conv.UserID = {{ Context.UserID | sqlString }}
  AND (
      a.UserID = {{ Context.UserID | sqlString }}
      OR EXISTS (
          SELECT 1
          FROM [__mj].[vwArtifactPermissions] ap
          WHERE ap.ArtifactID = a.ID
            AND ap.UserID = {{ Context.UserID | sqlString }}
            AND ap.CanRead = 1
      )
      OR EXISTS (
          SELECT 1
          FROM [__mj].[vwCollectionArtifacts] ca
          INNER JOIN [__mj].[vwCollections] c0 ON ca.CollectionID = c0.ID
          WHERE ca.ArtifactID = a.ID
            AND (
                c0.OwnerID = {{ Context.UserID | sqlString }}
                OR EXISTS (
                    SELECT 1
                    FROM [__mj].[vwCollectionPermissions] cp
                    WHERE cp.CollectionID = c0.ID
                      AND cp.UserID = {{ Context.UserID | sqlString }}
                      AND (cp.CanRead = 1 OR cp.CanEdit = 1 OR cp.CanDelete = 1 OR cp.CanShare = 1)
                )
            )
      )
  )
ORDER BY cda.__mj_CreatedAt, av.VersionNumber
