/*
    Backfill Artifact Pairs for Legacy ConversationDetailAttachment Rows
    --------------------------------------------------------------------
    Converts pre-unification ConversationDetailAttachment rows (those with
    ArtifactVersionID IS NULL) into proper MJ: Artifact + MJ: Artifact Version
    + MJ: Conversation Detail Artifact records so the attachment data is
    accessible through the unified artifact path.

    After this migration, all ConversationDetailAttachment rows have a
    corresponding artifact pair, and the back-compat read paths in
    AgentRunner.gatherConversationArtifacts and RunAIAgentResolver can be
    removed. The deprecated entity-level warning for
    "MJ: Conversation Detail Attachments" will stop once those read paths
    are deleted.

    The migration is idempotent: it only processes rows where
    ArtifactVersionID IS NULL, so re-running it on an already-migrated
    database is a no-op.

    Context: PR #2690 (artifact/attachment unification cleanup).
    See plans/artifact-attachment-cleanup.md Phase 3 (D1b).
*/

-- Step 1: Resolve MIME → ArtifactType for each legacy attachment.
--         Uses the same wildcard-matching semantics as the TypeScript
--         ArtifactMetadataEngine.GetArtifactTypeByMimeType() resolver:
--         exact MIME match beats wildcard (e.g. image/* matches image/jpeg).
--         Rows with no matching ArtifactType are skipped (no artifact created).

-- Temp table to hold the mapping + generated IDs for the multi-table insert
IF OBJECT_ID('tempdb..#AttachmentBackfill') IS NOT NULL DROP TABLE #AttachmentBackfill;

CREATE TABLE #AttachmentBackfill (
    AttachmentID        UNIQUEIDENTIFIER NOT NULL,
    ConversationDetailID UNIQUEIDENTIFIER NOT NULL,
    MimeType            NVARCHAR(100) NOT NULL,
    FileName            NVARCHAR(4000) NULL,
    FileSizeBytes       INT NULL,
    InlineData          NVARCHAR(MAX) NULL,
    FileID              UNIQUEIDENTIFIER NULL,
    UserID              UNIQUEIDENTIFIER NOT NULL,
    ArtifactTypeID      UNIQUEIDENTIFIER NOT NULL,
    NewArtifactID       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    NewVersionID        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    NewJunctionID       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()
);

INSERT INTO #AttachmentBackfill (
    AttachmentID, ConversationDetailID, MimeType, FileName, FileSizeBytes,
    InlineData, FileID, UserID, ArtifactTypeID
)
SELECT
    att.ID,
    att.ConversationDetailID,
    att.MimeType,
    att.FileName,
    att.FileSizeBytes,
    att.InlineData,
    att.FileID,
    conv.UserID,
    -- MIME → ArtifactType: prefer exact match, fall back to wildcard (e.g. image/*)
    COALESCE(
        -- Exact match
        (SELECT TOP 1 at1.ID
         FROM ${flyway:defaultSchema}.[ArtifactType] at1
         WHERE at1.ContentType = att.MimeType
           AND at1.IsEnabled = 1
         ORDER BY at1.Priority DESC, at1.ID),
        -- Wildcard match (e.g. image/* matches image/jpeg)
        (SELECT TOP 1 at2.ID
         FROM ${flyway:defaultSchema}.[ArtifactType] at2
         WHERE at2.ContentType LIKE '%/*'
           AND at2.IsEnabled = 1
           AND LEFT(att.MimeType, CHARINDEX('/', att.MimeType)) =
               LEFT(at2.ContentType, CHARINDEX('/', at2.ContentType))
         ORDER BY at2.Priority DESC, at2.ID)
    )
FROM ${flyway:defaultSchema}.[ConversationDetailAttachment] att
JOIN ${flyway:defaultSchema}.[ConversationDetail] cd ON cd.ID = att.ConversationDetailID
JOIN ${flyway:defaultSchema}.[Conversation] conv ON conv.ID = cd.ConversationID
WHERE att.ArtifactVersionID IS NULL
  AND att.MimeType IS NOT NULL
  -- Only process rows where we found a matching ArtifactType
  AND COALESCE(
        (SELECT TOP 1 at1.ID
         FROM ${flyway:defaultSchema}.[ArtifactType] at1
         WHERE at1.ContentType = att.MimeType AND at1.IsEnabled = 1
         ORDER BY at1.Priority DESC, at1.ID),
        (SELECT TOP 1 at2.ID
         FROM ${flyway:defaultSchema}.[ArtifactType] at2
         WHERE at2.ContentType LIKE '%/*' AND at2.IsEnabled = 1
           AND LEFT(att.MimeType, CHARINDEX('/', att.MimeType)) =
               LEFT(at2.ContentType, CHARINDEX('/', at2.ContentType))
         ORDER BY at2.Priority DESC, at2.ID)
      ) IS NOT NULL;

-- Report count for migration logging
DECLARE @backfillCount INT = (SELECT COUNT(*) FROM #AttachmentBackfill);
IF @backfillCount = 0
BEGIN
    PRINT 'No legacy ConversationDetailAttachment rows to backfill.';
END
ELSE
BEGIN
    PRINT 'Backfilling ' + CAST(@backfillCount AS NVARCHAR(10)) + ' legacy attachment(s) to artifact pairs...';

    -- Step 2: Create Artifact header rows
    INSERT INTO ${flyway:defaultSchema}.[Artifact] (ID, [Name], TypeID, UserID, Visibility)
    SELECT
        NewArtifactID,
        COALESCE(FileName, 'attachment_' + CAST(AttachmentID AS NVARCHAR(50))),
        ArtifactTypeID,
        UserID,
        'Always'
    FROM #AttachmentBackfill;

    -- Step 3: Create ArtifactVersion rows
    --         Binary MIMEs (image/*, audio/*, video/*, application/pdf, etc.)
    --         get stored as data:<mime>;base64,<payload> in Content.
    --         File-backed rows (FileID IS NOT NULL) use ContentMode='File'.
    INSERT INTO ${flyway:defaultSchema}.[ArtifactVersion] (
        ID, ArtifactID, VersionNumber, Content, UserID,
        ContentMode, FileID, MimeType, [FileName], ContentSizeBytes, [Name]
    )
    SELECT
        NewVersionID,
        NewArtifactID,
        1,
        CASE
            WHEN FileID IS NOT NULL THEN NULL
            WHEN InlineData IS NOT NULL THEN 'data:' + MimeType + ';base64,' + InlineData
            ELSE NULL
        END,
        UserID,
        CASE WHEN FileID IS NOT NULL THEN 'File' ELSE 'Text' END,
        FileID,
        MimeType,
        FileName,
        FileSizeBytes,
        COALESCE(FileName, 'attachment_' + CAST(AttachmentID AS NVARCHAR(50)))
    FROM #AttachmentBackfill;

    -- Step 4: Create ConversationDetailArtifact junction rows
    INSERT INTO ${flyway:defaultSchema}.[ConversationDetailArtifact] (
        ID, ConversationDetailID, ArtifactVersionID, Direction
    )
    SELECT
        NewJunctionID,
        ConversationDetailID,
        NewVersionID,
        'Input'
    FROM #AttachmentBackfill;

    -- Step 5: Set the ArtifactVersionID backlink on the attachment row
    --         so future queries with ArtifactVersionID IS NULL skip these
    UPDATE att
    SET att.ArtifactVersionID = bf.NewVersionID
    FROM ${flyway:defaultSchema}.[ConversationDetailAttachment] att
    JOIN #AttachmentBackfill bf ON bf.AttachmentID = att.ID;

    PRINT 'Backfill complete: created ' + CAST(@backfillCount AS NVARCHAR(10)) + ' artifact pair(s).';
END

DROP TABLE #AttachmentBackfill;
GO
