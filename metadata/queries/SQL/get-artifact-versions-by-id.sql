-- Get Artifact Versions By ID - Single optimized query
-- Returns all fields needed to construct InputArtifact records for agent context gathering.
-- Replaces a per-version loop that did two Load() calls (ArtifactVersion + Artifact) per row.
--
-- Parameters:
--   @versionIds: Array of ArtifactVersionIDs (rendered via sqlIn filter)

WITH ReadableCollections AS (
    SELECT c.ID, 0 AS Depth
    FROM [__mj].[vwCollections] c
    WHERE c.OwnerID = {{ Context.UserID | sqlString }}
       OR EXISTS (
           SELECT 1
           FROM [__mj].[vwCollectionPermissions] cp
           WHERE cp.CollectionID = c.ID
             AND cp.UserID = {{ Context.UserID | sqlString }}
             AND (cp.CanRead = 1 OR cp.CanEdit = 1 OR cp.CanDelete = 1 OR cp.CanShare = 1)
       )

    UNION ALL

    SELECT child.ID, rc.Depth + 1 AS Depth
    FROM [__mj].[vwCollections] child
    INNER JOIN ReadableCollections rc ON child.ParentID = rc.ID
    WHERE rc.Depth < 15
),
ReadableArtifacts AS (
    SELECT a_root.ID, 0 AS Depth
    FROM [__mj].[vwArtifacts] a_root
    WHERE (a_root.DelegateEntityID IS NULL OR a_root.DelegateRecordID IS NULL)
      AND (
          a_root.UserID = {{ Context.UserID | sqlString }}
          OR EXISTS (
              SELECT 1
              FROM [__mj].[vwArtifactPermissions] ap
              WHERE ap.ArtifactID = a_root.ID
                AND ap.UserID = {{ Context.UserID | sqlString }}
                AND (ap.CanRead = 1 OR ap.CanEdit = 1 OR ap.CanDelete = 1 OR ap.CanShare = 1)
          )
          OR EXISTS (
              SELECT 1
              FROM [__mj].[vwCollectionArtifacts] ca
              INNER JOIN [__mj].[vwArtifactVersions] av_ca ON ca.ArtifactVersionID = av_ca.ID
              INNER JOIN ReadableCollections rc ON ca.CollectionID = rc.ID
              WHERE av_ca.ArtifactID = a_root.ID
          )
      )

    UNION ALL

    SELECT child_art.ID, ra.Depth + 1 AS Depth
    FROM [__mj].[vwArtifacts] child_art
    INNER JOIN [__mj].[vwEntities] e_del ON child_art.DelegateEntityID = e_del.ID AND e_del.Name = 'MJ: Artifacts'
    INNER JOIN ReadableArtifacts ra ON LOWER(CAST(ra.ID AS NVARCHAR(36))) = LOWER(child_art.DelegateRecordID)
    WHERE ra.Depth < 8
      AND child_art.DelegateRecordID IS NOT NULL
)
SELECT
    av.ID as VersionID,
    av.ArtifactID as ArtifactID,
    av.VersionNumber as VersionNumber,
    av.Name as VersionName,
    av.Description as VersionDescription,
    av.ContentMode,
    av.FileID,
    av.Content,
    av.MimeType,
    av.ForceToolsOnly,

    a.Name as ArtifactName,
    a.Description as ArtifactDescription,
    a.Type as TypeName,

    at.ToolLibraryClass,
    at.DefaultDeliveryMode

FROM [__mj].[vwArtifactVersions] av
INNER JOIN [__mj].[vwArtifacts] a ON av.ArtifactID = a.ID
INNER JOIN [__mj].[vwArtifactTypes] at ON a.TypeID = at.ID

WHERE av.ID IN {{ versionIds | sqlIn }}
  AND EXISTS (
      SELECT 1
      FROM ReadableArtifacts ra
      WHERE ra.ID = a.ID
  )
ORDER BY av.__mj_CreatedAt ASC, av.VersionNumber ASC
