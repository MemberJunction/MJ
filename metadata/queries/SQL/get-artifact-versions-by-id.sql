-- Get Artifact Versions By ID - Single optimized query
-- Returns all fields needed to construct InputArtifact records for agent context gathering.
-- Replaces a per-version loop that did two Load() calls (ArtifactVersion + Artifact) per row.
--
-- Parameters:
--   @versionIds: Array of ArtifactVersionIDs (rendered via sqlIn filter)

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
  AND (
      a.UserID = {{ Context.UserID | sqlString }}
      OR EXISTS (
          SELECT 1
          FROM [__mj].[vwArtifactPermissions] ap
          WHERE ap.ArtifactID = a.ID
            AND ap.UserID = {{ Context.UserID | sqlString }}
            AND ap.CanRead = 1
      )
      OR EXISTS (
          SELECT 1
          FROM [__mj].[vwCollectionArtifacts] ca
          INNER JOIN [__mj].[vwCollections] c0 ON ca.CollectionID = c0.ID
          LEFT JOIN [__mj].[vwCollections] c1 ON c0.ParentID = c1.ID
          LEFT JOIN [__mj].[vwCollections] c2 ON c1.ParentID = c2.ID
          LEFT JOIN [__mj].[vwCollections] c3 ON c2.ParentID = c3.ID
          LEFT JOIN [__mj].[vwCollections] c4 ON c3.ParentID = c4.ID
          LEFT JOIN [__mj].[vwCollections] c5 ON c4.ParentID = c5.ID
          LEFT JOIN [__mj].[vwCollections] c6 ON c5.ParentID = c6.ID
          LEFT JOIN [__mj].[vwCollections] c7 ON c6.ParentID = c7.ID
          LEFT JOIN [__mj].[vwCollections] c8 ON c7.ParentID = c8.ID
          LEFT JOIN [__mj].[vwCollections] c9 ON c8.ParentID = c9.ID
          LEFT JOIN [__mj].[vwCollections] c10 ON c9.ParentID = c10.ID
          LEFT JOIN [__mj].[vwCollections] c11 ON c10.ParentID = c11.ID
          LEFT JOIN [__mj].[vwCollections] c12 ON c11.ParentID = c12.ID
          LEFT JOIN [__mj].[vwCollections] c13 ON c12.ParentID = c13.ID
          LEFT JOIN [__mj].[vwCollections] c14 ON c13.ParentID = c14.ID
          LEFT JOIN [__mj].[vwCollections] c15 ON c14.ParentID = c15.ID
          WHERE ca.ArtifactID = a.ID
            AND (
                c0.OwnerID = {{ Context.UserID | sqlString }}
                OR c1.OwnerID = {{ Context.UserID | sqlString }}
                OR c2.OwnerID = {{ Context.UserID | sqlString }}
                OR c3.OwnerID = {{ Context.UserID | sqlString }}
                OR c4.OwnerID = {{ Context.UserID | sqlString }}
                OR c5.OwnerID = {{ Context.UserID | sqlString }}
                OR c6.OwnerID = {{ Context.UserID | sqlString }}
                OR c7.OwnerID = {{ Context.UserID | sqlString }}
                OR c8.OwnerID = {{ Context.UserID | sqlString }}
                OR c9.OwnerID = {{ Context.UserID | sqlString }}
                OR c10.OwnerID = {{ Context.UserID | sqlString }}
                OR c11.OwnerID = {{ Context.UserID | sqlString }}
                OR c12.OwnerID = {{ Context.UserID | sqlString }}
                OR c13.OwnerID = {{ Context.UserID | sqlString }}
                OR c14.OwnerID = {{ Context.UserID | sqlString }}
                OR c15.OwnerID = {{ Context.UserID | sqlString }}
                OR EXISTS (
                    SELECT 1
                    FROM [__mj].[vwCollectionPermissions] cp
                    WHERE cp.UserID = {{ Context.UserID | sqlString }}
                      AND (cp.CanRead = 1 OR cp.CanEdit = 1 OR cp.CanDelete = 1 OR cp.CanShare = 1)
                      AND cp.CollectionID IN (c0.ID, c1.ID, c2.ID, c3.ID, c4.ID, c5.ID, c6.ID, c7.ID, c8.ID, c9.ID, c10.ID, c11.ID, c12.ID, c13.ID, c14.ID, c15.ID)
                )
            )
      )
  )
ORDER BY av.__mj_CreatedAt ASC, av.VersionNumber ASC
