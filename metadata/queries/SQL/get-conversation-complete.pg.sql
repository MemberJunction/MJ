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
WITH RECURSIVE "ReadableCollections" AS (
    SELECT c."ID", 0 AS "Depth"
    FROM __mj."vwCollections" c
    WHERE c."OwnerID" = {{ Context.UserID | sqlString }}
       OR EXISTS (
           SELECT 1
           FROM __mj."vwCollectionPermissions" cp
           WHERE cp."CollectionID" = c."ID"
             AND cp."UserID" = {{ Context.UserID | sqlString }}
             AND (cp."CanRead" = true OR cp."CanEdit" = true OR cp."CanDelete" = true OR cp."CanShare" = true)
       )

    UNION ALL

    SELECT child."ID", rc."Depth" + 1 AS "Depth"
    FROM __mj."vwCollections" child
    INNER JOIN "ReadableCollections" rc ON child."ParentID" = rc."ID"
    WHERE rc."Depth" < 15
),
"ReadableArtifacts" AS (
    SELECT a_root."ID", 0 AS "Depth"
    FROM __mj."vwArtifacts" a_root
    WHERE (a_root."DelegateEntityID" IS NULL OR a_root."DelegateRecordID" IS NULL)
      AND (
          a_root."UserID" = {{ Context.UserID | sqlString }}
          OR EXISTS (
              SELECT 1
              FROM __mj."vwArtifactPermissions" ap
              WHERE ap."ArtifactID" = a_root."ID"
                AND ap."UserID" = {{ Context.UserID | sqlString }}
                AND (ap."CanRead" = true OR ap."CanEdit" = true OR ap."CanDelete" = true OR ap."CanShare" = true)
          )
          OR EXISTS (
              SELECT 1
              FROM __mj."vwCollectionArtifacts" ca
              INNER JOIN __mj."vwArtifactVersions" av_ca ON ca."ArtifactVersionID" = av_ca."ID"
              INNER JOIN "ReadableCollections" rc ON ca."CollectionID" = rc."ID"
              WHERE av_ca."ArtifactID" = a_root."ID"
          )
      )

    UNION ALL

    SELECT child_art."ID", ra."Depth" + 1 AS "Depth"
    FROM __mj."vwArtifacts" child_art
    INNER JOIN __mj."vwEntities" e_del ON child_art."DelegateEntityID" = e_del."ID" AND e_del."Name" = 'MJ: Artifacts'
    INNER JOIN "ReadableArtifacts" ra ON LOWER(ra."ID"::text) = LOWER(child_art."DelegateRecordID")
    WHERE ra."Depth" < 8
      AND child_art."DelegateRecordID" IS NOT NULL
)
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
            'ParentRunID', ar."ParentRunID",
            'ContinuationDepth', ar."ContinuationDepth",
            'Status', ar."Status",
            '__mj_CreatedAt', ar."__mj_CreatedAt",
            '__mj_UpdatedAt', ar."__mj_UpdatedAt",
            'TotalPromptTokensUsed', ar."TotalPromptTokensUsed",
            'TotalCompletionTokensUsed', ar."TotalCompletionTokensUsed",
            'TotalCost', ar."TotalCost",
            'ConversationDetailID', ar."ConversationDetailID"
        ) ORDER BY
            CASE WHEN ar."ParentRunID" IS NULL THEN 0 ELSE 1 END ASC,
            COALESCE(ar."ContinuationDepth", 0) ASC,
            ar."__mj_CreatedAt" DESC)::text
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
          AND EXISTS (
              SELECT 1
              FROM "ReadableArtifacts" ra
              WHERE ra."ID" = a."ID"
          )
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
INNER JOIN __mj."vwConversations" conv ON cd."ConversationID" = conv."ID"
LEFT OUTER JOIN __mj."vwUsers" u ON cd."UserID" = u."ID"
WHERE cd."ConversationID" = {{ ConversationID | sqlString }}
  AND (
      conv."UserID" = {{ Context.UserID | sqlString }}
      OR (
          conv."AnchorType" IS NOT NULL
          AND (
              EXISTS (
                  SELECT 1
                  FROM __mj."vwEntities" e_art_acl
                  INNER JOIN "ReadableArtifacts" ra_conv ON LOWER(ra_conv."ID"::text) = LOWER(conv."LinkedRecordID")
                  WHERE e_art_acl."ID" = conv."LinkedEntityID"
                    AND e_art_acl."Name" = 'MJ: Artifacts'
              )
              OR EXISTS (
                  SELECT 1
                  FROM __mj."vwEntities" e_col_acl
                  INNER JOIN "ReadableCollections" rc_conv ON LOWER(rc_conv."ID"::text) = LOWER(conv."LinkedRecordID")
                  WHERE e_col_acl."ID" = conv."LinkedEntityID"
                    AND e_col_acl."Name" = 'MJ: Collections'
              )
          )
      )
  )
ORDER BY cd."__mj_CreatedAt" ASC
