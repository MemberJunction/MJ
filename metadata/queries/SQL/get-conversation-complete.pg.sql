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
              NOT EXISTS (
                  SELECT 1
                  FROM __mj."vwEntities" e_acl
                  WHERE e_acl."ID" = conv."LinkedEntityID"
                    AND e_acl."Name" IN ('MJ: Artifacts', 'MJ: Collections')
              )
              OR EXISTS (
                  SELECT 1
                  FROM __mj."vwArtifacts" art_acl
                  WHERE LOWER(art_acl."ID"::text) = LOWER(conv."LinkedRecordID")
                    AND (
                        art_acl."UserID" = {{ Context.UserID | sqlString }}
                        OR EXISTS (
                            SELECT 1
                            FROM __mj."vwArtifactPermissions" ap2
                            WHERE ap2."ArtifactID" = art_acl."ID"
                              AND ap2."UserID" = {{ Context.UserID | sqlString }}
                              AND ap2."CanRead" = true
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM __mj."vwCollectionArtifacts" ca2
                            INNER JOIN __mj."vwCollections" c2_0 ON ca2."CollectionID" = c2_0."ID"
                            WHERE ca2."ArtifactID" = art_acl."ID"
                              AND (
                                  c2_0."OwnerID" = {{ Context.UserID | sqlString }}
                                  OR EXISTS (
                                      SELECT 1
                                      FROM __mj."vwCollectionPermissions" cp2
                                      WHERE cp2."CollectionID" = c2_0."ID"
                                        AND cp2."UserID" = {{ Context.UserID | sqlString }}
                                        AND (cp2."CanRead" = true OR cp2."CanEdit" = true OR cp2."CanDelete" = true OR cp2."CanShare" = true)
                                  )
                              )
                        )
                    )
              )
              OR EXISTS (
                  SELECT 1
                  FROM __mj."vwCollections" col_acl
                  WHERE LOWER(col_acl."ID"::text) = LOWER(conv."LinkedRecordID")
                    AND (
                        col_acl."OwnerID" = {{ Context.UserID | sqlString }}
                        OR EXISTS (
                            SELECT 1
                            FROM __mj."vwCollectionPermissions" cp3
                            WHERE cp3."CollectionID" = col_acl."ID"
                              AND cp3."UserID" = {{ Context.UserID | sqlString }}
                              AND (cp3."CanRead" = true OR cp3."CanEdit" = true OR cp3."CanDelete" = true OR cp3."CanShare" = true)
                        )
                    )
              )
          )
      )
  )
ORDER BY cd."__mj_CreatedAt" ASC
