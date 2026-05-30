-- ============================================================================
-- Backfill Artifact Pairs for Legacy ConversationDetailAttachment Rows (PostgreSQL)
-- ============================================================================
--
-- Hand-authored PostgreSQL port of
--   migrations/v5/V202605271400__v5.38.x__Backfill_Attachment_Artifacts.sql
--
-- WHY .pg-only (not auto-converted): the SQL Server original is a procedural
-- batch built around a `#AttachmentBackfill` temp table with NEWSEQUENTIALID()
-- default columns, a `DECLARE @count = (SELECT ...)`, and an IF/ELSE/PRINT
-- control block. The rule-based SQLConverter does not model T-SQL temp tables
-- or batch-level procedural flow, so it produced invalid PL/pgSQL. This file is
-- the faithful manual translation (the converter's INSERT…SELECT mapping —
-- LIMIT 1, POSITION(), IsEnabled = TRUE — was already correct and is reused).
--
-- Semantics preserved: a session TEMP TABLE holds the MIME→ArtifactType mapping
-- plus generated IDs; the Artifact / ArtifactVersion / ConversationDetailArtifact
-- inserts and the back-link UPDATE run unconditionally (they are no-ops when the
-- temp table is empty, which it is on a fresh install — no legacy attachments to
-- backfill). Idempotent: only ConversationDetailAttachment rows with
-- ArtifactVersionID IS NULL and a resolvable ArtifactType are processed.
--
-- Context: PR #2690 (artifact/attachment unification cleanup).
-- ============================================================================

DROP TABLE IF EXISTS "AttachmentBackfill";

CREATE TEMP TABLE "AttachmentBackfill" (
    "AttachmentID"         UUID NOT NULL,
    "ConversationDetailID" UUID NOT NULL,
    "MimeType"             VARCHAR(100) NOT NULL,
    "FileName"             VARCHAR(4000) NULL,
    "FileSizeBytes"        INTEGER NULL,
    "InlineData"           TEXT NULL,
    "FileID"               UUID NULL,
    "UserID"               UUID NOT NULL,
    "ArtifactTypeID"       UUID NOT NULL,
    "NewArtifactID"        UUID NOT NULL DEFAULT gen_random_uuid(),
    "NewVersionID"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "NewJunctionID"        UUID NOT NULL DEFAULT gen_random_uuid()
);

-- Step 1: Resolve MIME → ArtifactType for each legacy attachment (exact match
--         beats wildcard, matching ArtifactMetadataEngine.GetArtifactTypeByMimeType).
INSERT INTO "AttachmentBackfill" (
    "AttachmentID", "ConversationDetailID", "MimeType", "FileName", "FileSizeBytes",
    "InlineData", "FileID", "UserID", "ArtifactTypeID"
)
SELECT
    att."ID",
    att."ConversationDetailID",
    att."MimeType",
    att."FileName",
    att."FileSizeBytes",
    att."InlineData",
    att."FileID",
    conv."UserID",
    COALESCE(
        (SELECT at1."ID"
         FROM ${flyway:defaultSchema}."ArtifactType" at1
         WHERE at1."ContentType" = att."MimeType"
           AND at1."IsEnabled" = TRUE
         ORDER BY at1."Priority" DESC, at1."ID"
         LIMIT 1),
        (SELECT at2."ID"
         FROM ${flyway:defaultSchema}."ArtifactType" at2
         WHERE at2."ContentType" LIKE '%/*'
           AND at2."IsEnabled" = TRUE
           AND LEFT(att."MimeType", POSITION('/' IN att."MimeType")) =
               LEFT(at2."ContentType", POSITION('/' IN at2."ContentType"))
         ORDER BY at2."Priority" DESC, at2."ID"
         LIMIT 1)
    )
FROM ${flyway:defaultSchema}."ConversationDetailAttachment" att
JOIN ${flyway:defaultSchema}."ConversationDetail" cd ON cd."ID" = att."ConversationDetailID"
JOIN ${flyway:defaultSchema}."Conversation" conv ON conv."ID" = cd."ConversationID"
WHERE att."ArtifactVersionID" IS NULL
  AND att."MimeType" IS NOT NULL
  AND COALESCE(
        (SELECT at1."ID"
         FROM ${flyway:defaultSchema}."ArtifactType" at1
         WHERE at1."ContentType" = att."MimeType" AND at1."IsEnabled" = TRUE
         ORDER BY at1."Priority" DESC, at1."ID"
         LIMIT 1),
        (SELECT at2."ID"
         FROM ${flyway:defaultSchema}."ArtifactType" at2
         WHERE at2."ContentType" LIKE '%/*' AND at2."IsEnabled" = TRUE
           AND LEFT(att."MimeType", POSITION('/' IN att."MimeType")) =
               LEFT(at2."ContentType", POSITION('/' IN at2."ContentType"))
         ORDER BY at2."Priority" DESC, at2."ID"
         LIMIT 1)
      ) IS NOT NULL;

-- Step 2: Create Artifact header rows.
INSERT INTO ${flyway:defaultSchema}."Artifact" ("ID", "Name", "TypeID", "UserID", "Visibility")
SELECT
    "NewArtifactID",
    COALESCE("FileName", 'attachment_' || "AttachmentID"::text),
    "ArtifactTypeID",
    "UserID",
    'Always'
FROM "AttachmentBackfill";

-- Step 3: Create ArtifactVersion rows. Binary MIMEs are stored as
--         data:<mime>;base64,<payload>; file-backed rows use ContentMode='File'.
INSERT INTO ${flyway:defaultSchema}."ArtifactVersion" (
    "ID", "ArtifactID", "VersionNumber", "Content", "UserID",
    "ContentMode", "FileID", "MimeType", "FileName", "ContentSizeBytes", "Name"
)
SELECT
    "NewVersionID",
    "NewArtifactID",
    1,
    CASE
        WHEN "FileID" IS NOT NULL THEN NULL
        WHEN "InlineData" IS NOT NULL THEN 'data:' || "MimeType" || ';base64,' || "InlineData"
        ELSE NULL
    END,
    "UserID",
    CASE WHEN "FileID" IS NOT NULL THEN 'File' ELSE 'Text' END,
    "FileID",
    "MimeType",
    "FileName",
    "FileSizeBytes",
    COALESCE("FileName", 'attachment_' || "AttachmentID"::text)
FROM "AttachmentBackfill";

-- Step 4: Create ConversationDetailArtifact junction rows.
INSERT INTO ${flyway:defaultSchema}."ConversationDetailArtifact" (
    "ID", "ConversationDetailID", "ArtifactVersionID", "Direction"
)
SELECT
    "NewJunctionID",
    "ConversationDetailID",
    "NewVersionID",
    'Input'
FROM "AttachmentBackfill";

-- Step 5: Set the ArtifactVersionID backlink on the attachment rows so future
--         queries with ArtifactVersionID IS NULL skip these.
UPDATE ${flyway:defaultSchema}."ConversationDetailAttachment" att
SET "ArtifactVersionID" = bf."NewVersionID"
FROM "AttachmentBackfill" bf
WHERE bf."AttachmentID" = att."ID";

DROP TABLE IF EXISTS "AttachmentBackfill";
