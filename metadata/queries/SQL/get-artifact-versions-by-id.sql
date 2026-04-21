-- Get Artifact Versions By ID - Single optimized query
-- Returns all fields needed to construct InputArtifact records for agent context gathering.
-- Replaces a per-version loop that did two Load() calls (ArtifactVersion + Artifact) per row.
--
-- Parameters:
--   @versionIds: Array of ArtifactVersionIDs (rendered via sqlIn filter)

SELECT
    av.ID as VersionID,
    av.Name as VersionName,
    av.ContentMode,
    av.FileID,
    av.Content,
    av.MimeType,

    a.Name as ArtifactName,
    a.Type as TypeName,

    at.ToolLibraryClass

FROM [__mj].[vwArtifactVersions] av
INNER JOIN [__mj].[vwArtifacts] a ON av.ArtifactID = a.ID
INNER JOIN [__mj].[vwArtifactTypes] at ON a.TypeID = at.ID

WHERE av.ID IN {{ versionIds | sqlIn }}
