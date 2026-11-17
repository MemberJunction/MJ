-- PostgreSQL variant: Get Artifact Versions By ID
-- Mirrors get-artifact-versions-by-id.sql for PG. Differences:
--   * `[__mj].[X]` → `__mj."X"` (schema brackets removed, view names quoted).
--   * Bare PascalCase column refs double-quoted to survive PG's case-folding.

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
          LEFT JOIN __mj."vwCollections" c1 ON c0."ParentID" = c1."ID"
          LEFT JOIN __mj."vwCollections" c2 ON c1."ParentID" = c2."ID"
          LEFT JOIN __mj."vwCollections" c3 ON c2."ParentID" = c3."ID"
          LEFT JOIN __mj."vwCollections" c4 ON c3."ParentID" = c4."ID"
          LEFT JOIN __mj."vwCollections" c5 ON c4."ParentID" = c5."ID"
          LEFT JOIN __mj."vwCollections" c6 ON c5."ParentID" = c6."ID"
          LEFT JOIN __mj."vwCollections" c7 ON c6."ParentID" = c7."ID"
          LEFT JOIN __mj."vwCollections" c8 ON c7."ParentID" = c8."ID"
          LEFT JOIN __mj."vwCollections" c9 ON c8."ParentID" = c9."ID"
          LEFT JOIN __mj."vwCollections" c10 ON c9."ParentID" = c10."ID"
          LEFT JOIN __mj."vwCollections" c11 ON c10."ParentID" = c11."ID"
          LEFT JOIN __mj."vwCollections" c12 ON c11."ParentID" = c12."ID"
          LEFT JOIN __mj."vwCollections" c13 ON c12."ParentID" = c13."ID"
          LEFT JOIN __mj."vwCollections" c14 ON c13."ParentID" = c14."ID"
          LEFT JOIN __mj."vwCollections" c15 ON c14."ParentID" = c15."ID"
          WHERE ca."ArtifactID" = a."ID"
            AND (
                c0."OwnerID" = {{ Context.UserID | sqlString }}
                OR c1."OwnerID" = {{ Context.UserID | sqlString }}
                OR c2."OwnerID" = {{ Context.UserID | sqlString }}
                OR c3."OwnerID" = {{ Context.UserID | sqlString }}
                OR c4."OwnerID" = {{ Context.UserID | sqlString }}
                OR c5."OwnerID" = {{ Context.UserID | sqlString }}
                OR c6."OwnerID" = {{ Context.UserID | sqlString }}
                OR c7."OwnerID" = {{ Context.UserID | sqlString }}
                OR c8."OwnerID" = {{ Context.UserID | sqlString }}
                OR c9."OwnerID" = {{ Context.UserID | sqlString }}
                OR c10."OwnerID" = {{ Context.UserID | sqlString }}
                OR c11."OwnerID" = {{ Context.UserID | sqlString }}
                OR c12."OwnerID" = {{ Context.UserID | sqlString }}
                OR c13."OwnerID" = {{ Context.UserID | sqlString }}
                OR c14."OwnerID" = {{ Context.UserID | sqlString }}
                OR c15."OwnerID" = {{ Context.UserID | sqlString }}
                OR EXISTS (
                    SELECT 1
                    FROM __mj."vwCollectionPermissions" cp
                    WHERE cp."UserID" = {{ Context.UserID | sqlString }}
                      AND (cp."CanRead" = true OR cp."CanEdit" = true OR cp."CanDelete" = true OR cp."CanShare" = true)
                      AND cp."CollectionID" IN (c0."ID", c1."ID", c2."ID", c3."ID", c4."ID", c5."ID", c6."ID", c7."ID", c8."ID", c9."ID", c10."ID", c11."ID", c12."ID", c13."ID", c14."ID", c15."ID")
                )
            )
      )
  )
ORDER BY av."__mj_CreatedAt" ASC, av."VersionNumber" ASC
