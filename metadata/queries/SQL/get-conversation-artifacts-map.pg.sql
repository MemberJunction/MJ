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
WHERE cd."ConversationID" = {{ ConversationID | sqlString }}
  AND cda."Direction" = 'Output'
ORDER BY cda."__mj_CreatedAt", av."VersionNumber"
