-- PostgreSQL variant: Get Conversation Artifacts Map — basic artifact info for a conversation, without
-- the full content.
-- Mirrors get-conversation-artifacts-map.sql. Differences:
--   * `[__mj].[X]` → `__mj."X"`; column names double-quoted, since PG folds unquoted names to lower case.
SELECT
    cda."ConversationDetailID",
    cda."Direction",
    av."ID" AS "ArtifactVersionID",
    av."VersionNumber",
    av."ArtifactID",
    a."Name" AS "ArtifactName",
    a."Type" AS "ArtifactType",
    a."Description" AS "ArtifactDescription"
FROM __mj."vwConversationDetailArtifacts" cda
INNER JOIN __mj."vwArtifactVersions" av ON cda."ArtifactVersionID" = av."ID"
INNER JOIN __mj."vwArtifacts" a ON av."ArtifactID" = a."ID"
INNER JOIN __mj."vwConversationDetails" cd ON cda."ConversationDetailID" = cd."ID"
INNER JOIN __mj."vwConversations" conv ON cd."ConversationID" = conv."ID"
WHERE cd."ConversationID" = {{ ConversationID | sqlString }}
  AND cda."Direction" = 'Output'
  AND conv."UserID" = {{ Context.UserID | sqlString }}
  AND (
      a."UserID" = {{ Context.UserID | sqlString }}
      OR EXISTS (
          SELECT 1
          FROM __mj."vwArtifactPermissions" ap
          WHERE ap."ArtifactID" = a."ID"
            AND ap."UserID" = {{ Context.UserID | sqlString }}
            AND ap."CanRead" = true
      )
      OR EXISTS (
          SELECT 1
          FROM __mj."vwCollectionArtifacts" ca
          INNER JOIN __mj."vwCollections" c0 ON ca."CollectionID" = c0."ID"
          WHERE ca."ArtifactID" = a."ID"
            AND (
                c0."OwnerID" = {{ Context.UserID | sqlString }}
                OR EXISTS (
                    SELECT 1
                    FROM __mj."vwCollectionPermissions" cp
                    WHERE cp."CollectionID" = c0."ID"
                      AND cp."UserID" = {{ Context.UserID | sqlString }}
                      AND (cp."CanRead" = true OR cp."CanEdit" = true OR cp."CanDelete" = true OR cp."CanShare" = true)
                )
            )
      )
  )
ORDER BY cda."__mj_CreatedAt", av."VersionNumber"
