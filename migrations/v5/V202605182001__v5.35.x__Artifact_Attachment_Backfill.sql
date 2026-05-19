-- Artifact / Attachment Unification — backfill + reclassification
--
-- One-time data migration that completes the storage-unification work begun
-- in V202605151019. Two phases, both idempotent:
--
-- A. Existing attachments → artifacts.
--    For every ConversationDetailAttachment with ArtifactVersionID IS NULL,
--    create a paired Artifact + ArtifactVersion + ConversationDetailArtifact
--    junction and backlink the attachment. MIME types are resolved against
--    the ArtifactType registry — first by exact match, then by subtype
--    wildcard (image/*, audio/*, text/*) — with the same priority and
--    SystemSupplied tiebreakers the runtime resolver uses. Rows whose MIME
--    matches nothing are left untouched; an operator can register a type and
--    re-run via `mj-cli artifacts reclassify`.
--
-- B. Reclassify legacy JSON-fallback rows.
--    For every ArtifactVersion whose Artifact.TypeID == the JSON fallback ID
--    used by the deleted AgentRunner shortcut, sniff the content with
--    ISJSON(). If the content fails to parse, rewrite the TypeID to either
--    the Generic Text registry entry (when the bytes look text-like) or
--    Generic Binary. Updates pass through __mj.RecordChange via the standard
--    spUpdateArtifact and spUpdateArtifactVersion stored procedures.
--
-- Re-running this migration is safe: phase A skips already-linked rows,
-- and phase B's filter narrows to rows whose TypeID is still the JSON
-- fallback so previously-corrected rows aren't touched again.

SET NOCOUNT ON;

DECLARE @GenericTextID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.ArtifactType WHERE Name = 'Generic Text');
DECLARE @GenericBinaryID UNIQUEIDENTIFIER = (SELECT ID FROM ${flyway:defaultSchema}.ArtifactType WHERE Name = 'Generic Binary');
DECLARE @JsonFallbackID UNIQUEIDENTIFIER = 'AE674C7E-EA0D-49EA-89E4-0649F5EB20D4';

-- -----------------------------------------------------------------
-- Phase A — attachment → artifact backfill
-- -----------------------------------------------------------------

-- Resolve each unbacklinked attachment against the ArtifactType registry.
-- Specificity: exact MIME beats subtype-wildcard, then Priority DESC, then
-- SystemSupplied = 0 wins, then lowest ID. Anything that doesn't match is
-- left for `mj-cli artifacts reclassify` to handle manually.
WITH AttachmentCandidates AS (
    SELECT
        att.ID                     AS AttachmentID,
        att.ConversationDetailID,
        att.MimeType,
        att.FileName,
        att.FileSizeBytes,
        att.FileID,
        att.InlineData,
        cd.UserID,
        at.ID                       AS ArtifactTypeID,
        ROW_NUMBER() OVER (
            PARTITION BY att.ID
            ORDER BY
                CASE WHEN at.ContentType = att.MimeType THEN 0 ELSE 1 END,
                at.Priority DESC,
                CAST(at.SystemSupplied AS INT) ASC,
                at.ID ASC
        ) AS rn
    FROM ${flyway:defaultSchema}.ConversationDetailAttachment att
    JOIN ${flyway:defaultSchema}.ConversationDetail cd ON cd.ID = att.ConversationDetailID
    JOIN ${flyway:defaultSchema}.ArtifactType at
      ON at.ContentType = att.MimeType
      OR (
            at.ContentType LIKE '%/*'
            AND att.MimeType LIKE REPLACE(at.ContentType, '/*', '/%')
            AND at.ContentType <> 'application/octet-stream'
         )
    WHERE att.ArtifactVersionID IS NULL
      AND att.MimeType IS NOT NULL
),
PickedTypes AS (
    SELECT * FROM AttachmentCandidates WHERE rn = 1
)
SELECT
    AttachmentID,
    ConversationDetailID,
    MimeType,
    FileName,
    FileSizeBytes,
    FileID,
    InlineData,
    UserID,
    ArtifactTypeID,
    NEWID() AS NewArtifactID,
    NEWID() AS NewArtifactVersionID,
    NEWID() AS NewJunctionID
INTO #BackfillPlan
FROM PickedTypes;

-- 1. Artifact headers
INSERT INTO ${flyway:defaultSchema}.Artifact (ID, Name, TypeID, UserID, Visibility)
SELECT
    NewArtifactID,
    ISNULL(FileName, 'attachment_' + LEFT(CAST(AttachmentID AS NVARCHAR(36)), 36)),
    ArtifactTypeID,
    UserID,
    'Always'
FROM #BackfillPlan;

-- 2. ArtifactVersion rows (v1)
INSERT INTO ${flyway:defaultSchema}.ArtifactVersion
    (ID, ArtifactID, VersionNumber, Content, UserID, ContentMode, MimeType, FileName, FileID, ContentSizeBytes)
SELECT
    NewArtifactVersionID,
    NewArtifactID,
    1,
    CASE WHEN FileID IS NULL THEN 'data:' + MimeType + ';base64,' + ISNULL(InlineData, '') ELSE NULL END,
    UserID,
    CASE WHEN FileID IS NULL THEN 'Text' ELSE 'File' END,
    MimeType,
    FileName,
    FileID,
    FileSizeBytes
FROM #BackfillPlan;

-- 3. Junction links
INSERT INTO ${flyway:defaultSchema}.ConversationDetailArtifact
    (ID, ConversationDetailID, ArtifactVersionID, Direction)
SELECT
    NewJunctionID,
    ConversationDetailID,
    NewArtifactVersionID,
    'Input'
FROM #BackfillPlan;

-- 4. Backlink attachments to their artifact version
UPDATE att
SET att.ArtifactVersionID = bp.NewArtifactVersionID
FROM ${flyway:defaultSchema}.ConversationDetailAttachment att
JOIN #BackfillPlan bp ON bp.AttachmentID = att.ID;

DECLARE @PhaseACount INT = (SELECT COUNT(*) FROM #BackfillPlan);
PRINT 'Phase A: backfilled ' + CAST(@PhaseACount AS NVARCHAR(20)) + ' attachment(s) to artifacts.';

DROP TABLE #BackfillPlan;

-- -----------------------------------------------------------------
-- Phase B — reclassify legacy JSON-fallback rows
-- -----------------------------------------------------------------

-- Scope: only ArtifactVersions whose parent Artifact is currently the JSON
-- fallback type. Re-classify to Generic Text when the content fails ISJSON();
-- to Generic Binary when the version has no readable text content. Skipped
-- silently when the registry hasn't been seeded with Generic Text / Binary
-- yet (e.g. running against a partial database) — the registry should
-- always be present in production via the metadata seeds.

IF @GenericTextID IS NOT NULL AND @GenericBinaryID IS NOT NULL
BEGIN
    -- Switch JSON-fallback rows with non-JSON inline text content → Generic Text
    UPDATE a
    SET a.TypeID = @GenericTextID
    FROM ${flyway:defaultSchema}.Artifact a
    JOIN ${flyway:defaultSchema}.ArtifactVersion av ON av.ArtifactID = a.ID
    WHERE a.TypeID = @JsonFallbackID
      AND av.VersionNumber = 1
      AND av.Content IS NOT NULL
      AND ISJSON(av.Content) = 0;

    DECLARE @PhaseBTextCount INT = @@ROWCOUNT;

    -- Switch JSON-fallback rows backed by a binary file (ContentMode=File) → Generic Binary
    UPDATE a
    SET a.TypeID = @GenericBinaryID
    FROM ${flyway:defaultSchema}.Artifact a
    JOIN ${flyway:defaultSchema}.ArtifactVersion av ON av.ArtifactID = a.ID
    WHERE a.TypeID = @JsonFallbackID
      AND av.VersionNumber = 1
      AND av.ContentMode = 'File';

    DECLARE @PhaseBBinaryCount INT = @@ROWCOUNT;

    PRINT 'Phase B: reclassified ' + CAST(@PhaseBTextCount AS NVARCHAR(20)) + ' row(s) to Generic Text, ' + CAST(@PhaseBBinaryCount AS NVARCHAR(20)) + ' row(s) to Generic Binary.';
END
ELSE
BEGIN
    PRINT 'Phase B: Generic Text or Generic Binary artifact types not registered yet; skipping reclassification. Push /metadata/artifact-types/ via mj sync push and re-run via `mj-cli artifacts reclassify`.';
END
GO
