-- PostgreSQL variant: Get Artifact Versions By ID
-- Mirrors get-artifact-versions-by-id.sql for PG. Differences:
--   * `[__mj].[X]` → `__mj."X"` (schema brackets removed, view names quoted).
--   * Bare PascalCase column refs double-quoted to survive PG's case-folding.

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
    av."ID" AS "VersionID",
    av."ArtifactID" AS "ArtifactID",
    av."VersionNumber" AS "VersionNumber",
    av."Name" AS "VersionName",
    av."Description" AS "VersionDescription",
    av."ContentMode",
    av."FileID",
    av."Content",
    av."MimeType",
    av."ForceToolsOnly",

    a."Name" AS "ArtifactName",
    a."Description" AS "ArtifactDescription",
    a."Type" AS "TypeName",

    at."ToolLibraryClass",
    at."DefaultDeliveryMode"

FROM __mj."vwArtifactVersions" av
INNER JOIN __mj."vwArtifacts" a ON av."ArtifactID" = a."ID"
INNER JOIN __mj."vwArtifactTypes" at ON a."TypeID" = at."ID"

WHERE av."ID" IN {{ versionIds | sqlIn }}
  AND EXISTS (
      SELECT 1
      FROM "ReadableArtifacts" ra
      WHERE ra."ID" = a."ID"
  )
ORDER BY av."__mj_CreatedAt" ASC, av."VersionNumber" ASC
