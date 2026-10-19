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
ORDER BY av.__mj_CreatedAt ASC, av.VersionNumber ASC
