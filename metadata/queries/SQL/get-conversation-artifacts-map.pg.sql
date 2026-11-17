-- PostgreSQL variant: Get Conversation Artifacts Map — basic artifact info for a conversation, without
-- the full content.
-- Mirrors get-conversation-artifacts-map.sql. Differences:
--   * `[__mj].[X]` → `__mj."X"`; column names double-quoted, since PG folds unquoted names to lower case.
-- Security note: Anchored conversations require non-SQL-scoped Artifacts/Collections anchors (`vwEntities`)
-- rather than evaluating TypeScript FieldSecuritySQLGate restrictedFields per anchor entity.
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
  AND EXISTS (
      SELECT 1
      FROM "ReadableArtifacts" ra
      WHERE ra."ID" = a."ID"
  )
ORDER BY cda."__mj_CreatedAt", av."VersionNumber"
