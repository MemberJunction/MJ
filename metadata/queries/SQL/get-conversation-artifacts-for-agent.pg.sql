-- PostgreSQL variant: Get Conversation Artifacts For Agent
-- Mirrors get-conversation-artifacts-for-agent.sql for PG. Differences:
--   * `[__mj].[X]` → `__mj."X"` (schema brackets removed, view names quoted).
--   * Bare PascalCase column refs double-quoted to survive PG's case-folding.

SELECT
    -- Artifact fields
    a."ID" AS "ArtifactID",
    a."Name" AS "ArtifactName",
    a."Description" AS "ArtifactDescription",
    a."Type" AS "ArtifactType",
    a."Visibility" AS "SharingScope",
    a."Comments" AS "ArtifactComments",
    a."__mj_CreatedAt" AS "ArtifactCreatedAt",
    a."__mj_UpdatedAt" AS "ArtifactUpdatedAt",

    -- Artifact Type details
    at."ID" AS "ArtifactTypeID",
    at."Name" AS "ArtifactTypeName",
    at."Description" AS "ArtifactTypeDescription",
    at."ContentType" AS "ArtifactTypeContentType",
    at."__mj_CreatedAt" AS "ArtifactTypeCreatedAt",
    at."__mj_UpdatedAt" AS "ArtifactTypeUpdatedAt",

    -- Version fields
    av."ID" AS "VersionID",
    av."VersionNumber" AS "Version",
    av."Configuration",
    av."Content",
    av."Comments" AS "VersionComments",
    av."__mj_CreatedAt" AS "VersionCreatedAt",
    av."__mj_UpdatedAt" AS "VersionUpdatedAt",

    -- ConversationDetailID that created this version (from join table)
    cda."ConversationDetailID"

FROM __mj."vwConversationDetailArtifacts" cda
INNER JOIN __mj."vwArtifactVersions" av ON cda."ArtifactVersionID" = av."ID"
INNER JOIN __mj."vwArtifacts" a ON av."ArtifactID" = a."ID"
INNER JOIN __mj."vwArtifactTypes" at ON a."TypeID" = at."ID"
INNER JOIN __mj."vwConversationDetails" cd ON cda."ConversationDetailID" = cd."ID"

WHERE cd."ConversationID" = {{ ConversationID | sqlString }}
  AND cda."Direction" = 'Output'  -- Only artifacts produced by agents (not inputs)
  {% if AgentID %}
  AND cd."AgentID" = {{ AgentID | sqlString }}  -- Optional: filter by specific agent ID
  {% endif %}

ORDER BY a."__mj_CreatedAt" ASC, av."VersionNumber" ASC
