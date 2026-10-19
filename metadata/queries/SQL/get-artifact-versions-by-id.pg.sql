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
ORDER BY av."__mj_CreatedAt" ASC, av."VersionNumber" ASC
