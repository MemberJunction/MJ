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
            ar.ParentRunID,
            ar.ContinuationDepth,
            ar.Status,
            ar.__mj_CreatedAt,
            ar.__mj_UpdatedAt,
            ar.TotalPromptTokensUsed,
            ar.TotalCompletionTokensUsed,
            ar.TotalCost,
            ar.ConversationDetailID
        FROM [__mj].[vwAIAgentRuns] ar
        WHERE ar.ConversationDetailID = cd.ID
        ORDER BY
            CASE WHEN ar.ParentRunID IS NULL THEN 0 ELSE 1 END ASC,
            ISNULL(ar.ContinuationDepth, 0) ASC,
            ar.__mj_CreatedAt DESC
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
INNER JOIN [__mj].[vwConversations] conv ON cd.ConversationID = conv.ID
LEFT OUTER JOIN [__mj].[vwUsers] u ON cd.UserID = u.ID
WHERE cd.ConversationID = {{ ConversationID | sqlString }}
  AND (
      conv.UserID = {{ Context.UserID | sqlString }}
      OR (
          conv.AnchorType IS NOT NULL
          AND (
              NOT EXISTS (
                  SELECT 1
                  FROM [__mj].[vwEntities] e_acl
                  WHERE e_acl.ID = conv.LinkedEntityID
                    AND e_acl.Name IN ('MJ: Artifacts', 'MJ: Collections')
              )
              OR EXISTS (
                  SELECT 1
                  FROM [__mj].[vwArtifacts] art_acl
                  WHERE LOWER(CAST(art_acl.ID AS NVARCHAR(36))) = LOWER(conv.LinkedRecordID)
                    AND (
                        art_acl.UserID = {{ Context.UserID | sqlString }}
                        OR EXISTS (
                            SELECT 1
                            FROM [__mj].[vwArtifactPermissions] ap2
                            WHERE ap2.ArtifactID = art_acl.ID
                              AND ap2.UserID = {{ Context.UserID | sqlString }}
                              AND ap2.CanRead = 1
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM [__mj].[vwCollectionArtifacts] ca2
                            INNER JOIN [__mj].[vwCollections] c2_0 ON ca2.CollectionID = c2_0.ID
                            WHERE ca2.ArtifactID = art_acl.ID
                              AND (
                                  c2_0.OwnerID = {{ Context.UserID | sqlString }}
                                  OR EXISTS (
                                      SELECT 1
                                      FROM [__mj].[vwCollectionPermissions] cp2
                                      WHERE cp2.CollectionID = c2_0.ID
                                        AND cp2.UserID = {{ Context.UserID | sqlString }}
                                        AND (cp2.CanRead = 1 OR cp2.CanEdit = 1 OR cp2.CanDelete = 1 OR cp2.CanShare = 1)
                                  )
                              )
                        )
                    )
              )
              OR EXISTS (
                  SELECT 1
                  FROM [__mj].[vwCollections] col_acl
                  WHERE LOWER(CAST(col_acl.ID AS NVARCHAR(36))) = LOWER(conv.LinkedRecordID)
                    AND (
                        col_acl.OwnerID = {{ Context.UserID | sqlString }}
                        OR EXISTS (
                            SELECT 1
                            FROM [__mj].[vwCollectionPermissions] cp3
                            WHERE cp3.CollectionID = col_acl.ID
                              AND cp3.UserID = {{ Context.UserID | sqlString }}
                              AND (cp3.CanRead = 1 OR cp3.CanEdit = 1 OR cp3.CanDelete = 1 OR cp3.CanShare = 1)
                        )
                    )
              )
          )
      )
  )
ORDER BY cd.__mj_CreatedAt ASC
