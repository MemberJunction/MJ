-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610252000__v6.2.x__Content_Pipeline_Framework.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The transpiler kept T-SQL's `UPDATE alias … FROM t AS alias` form and `DATALENGTH` in the
-- ContentItem status back-fill; it is written here as `UPDATE t AS alias …` with `octet_length`
-- (NULL for NULL text, as DATALENGTH is, so text-less items still back-fill to Skipped). Same rows.
-- This file carries no CodeGen objects (a gapped file is not baked). The base views and CRUD
-- routines of the entities it changes are in the release's PG_CodeGen_Regen.pg-only.sql.
-- ╚════════════════════════════════════════╝

ALTER TABLE __mj."ContentItem"
  ADD COLUMN "FieldConfidence" TEXT NULL,
  ADD COLUMN "ExtractionStatus" VARCHAR(40) NULL,
  ADD COLUMN "SegmentationStatus" VARCHAR(40) NULL,
  ADD COLUMN "DeleteStatus" VARCHAR(20) NULL,
  ADD COLUMN "ExtractorKey" VARCHAR(100) NULL,
  ADD COLUMN "ExtractorKeyOverride" VARCHAR(100) NULL,
  ADD COLUMN "Modality" VARCHAR(20) NULL,
  ADD COLUMN "Date" TIMESTAMPTZ NULL,
  ADD COLUMN "Decorator" TEXT NULL,
  ADD COLUMN "FileID" UUID NULL
 /*
  Content Pipeline Framework — phase F0 schema.

  Adds the working-record substrate the content pipeline stages are built on.

  One rule decides what is a column here and what is not: **settings live in Configuration JSON;
  per-record state and receipts live in columns.** Nothing ships in both shapes, and no column
  ships unread. So the extractor cascade's per-source and per-run defaults stay in Configuration,
  while ContentType.ExtractorKey is a column — a per-content-type default has no JSON home, and
  reading it from run Options would make it per-run instead — and ContentItem.ExtractorKey /
  ExtractorKeyOverride are columns because they are this record's routing state and its receipt of
  what actually ran.

  Columns added:
    * FieldConfidence   — per-field provenance/confidence JSON on the three pipeline entities
    * stage statuses    — ExtractionStatus / SegmentationStatus on Content Item, alongside the
                          existing TaggingStatus / EmbeddingStatus
    * DeleteStatus      — soft-delete marker on Content Item, mirroring Content Item Chunk
    * extractor cascade — ExtractorKey on Content Type (the per-type default, beside the existing
                          SegmenterKey / CleanerKey / EmbeddingModelID) and on Content Item (what
                          ran), plus ExtractorKeyOverride (what was forced)
    * ForceDiscovery    — a one-shot "walk this source now", off-schedule
    * LastDiscoveredAt  — when the source was last walked by Discover (passed back as Since)
    * LastSyncedAt      — when the source last completed a full Sync walk (reconciling removals)
    * well-known fields — Date, Decorator and Modality on Content Item, Decorator on Content Item
                          Chunk
    * FileID            — the durable copy of a fetched artifact, as an MJ File

  Scheduling is deployment-owned; the shipped Discover process selects ForceDiscovery = 1 and a
  completed walk clears the bit, while the shipped Sync process selects by LastSyncedAt
  (LastSyncedAt IS NULL OR LastSyncedAt < DATEADD(day, -30, GETUTCDATE())), never by ForceDiscovery.
  To force a sync on a source, set its LastSyncedAt back (or to NULL). There is deliberately no
  DiscoveryStatus column to re-arm.

  ContentItem.Checksum holds the SHA-256 hex digest of the extracted text (or raw bytes for
  non-text modality), written by the Extract stage using the same algorithm as the legacy
  autotagger's GetChecksumFromText so existing rows match on upgrade without re-processing.

  There is deliberately no unique index on (ContentSourceID, URL). The Entity and LocalFS
  autotaggers have long stored many items under one URL, so the index cannot be created wherever
  they have run, and URL is nvarchar(2000) — past the index key limit. Matching an item to its row by
  URL is the pipeline's job, in code; a source whose URLs are not unique is simply not a candidate
  for change detection, and its rows still get in.

  Every change is additive. Naming follows the conventions already in these tables: SegmenterKey /
  CleanerKey establish the nvarchar(100) "registered class key" pattern, and the status columns on
  Content Item are nvarchar(40) over a five-value list.
*/ /* --------------------------------------------------------------------------- */ /* Content Item */ /* --------------------------------------------------------------------------- */;

ALTER TABLE __mj."ContentItem"
  ADD CONSTRAINT "CK_ContentItem_ExtractionStatus" CHECK ("ExtractionStatus" IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped'));

ALTER TABLE __mj."ContentItem"
  ADD CONSTRAINT "CK_ContentItem_SegmentationStatus" CHECK ("SegmentationStatus" IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped'));

ALTER TABLE __mj."ContentItem"
  ADD CONSTRAINT "CK_ContentItem_DeleteStatus" CHECK ("DeleteStatus" IN ('Pending', 'Deleted'))
 /* Deleted is terminal. The Delete stage owns the outside-system cleanup, so a row stays Pending */ /* until that cleanup has actually run — there is deliberately no 'Complete'. */;

ALTER TABLE __mj."ContentItem"
  ADD CONSTRAINT "CK_ContentItem_Modality" CHECK ("Modality" IN ('text', 'image', 'audio', 'video', 'multimodal'));

ALTER TABLE __mj."ContentItem"
  ADD CONSTRAINT "FK_ContentItem_File" FOREIGN KEY ("FileID") REFERENCES __mj."File" (
    "ID"
  );

/* Existing rows have already been through extraction and segmentation under the autotagger, so */
/* they are back-filled to a terminal status rather than left to queue for reprocessing. An item */
/* with text has been extracted; one without never will be by re-running Extract over the same URL, */
/* so it is Skipped rather than Pending. Segmentation is read from whether chunks exist. */
UPDATE __mj."ContentItem" AS "ci" SET "ExtractionStatus" = CASE WHEN octet_length("ci"."Text") > 0 THEN 'Complete' ELSE 'Skipped' END, "SegmentationStatus" = CASE
  WHEN EXISTS(
    SELECT
      1
    FROM __mj."ContentItemChunk" AS "c"
    WHERE
      "c"."ContentItemID" = "ci"."ID"
  )
  THEN 'Complete'
  ELSE 'Skipped'
END;

ALTER TABLE __mj."ContentItem"
DROP CONSTRAINT "CK_ContentItem_EmbeddingStatus" /* Widen EmbeddingStatus on BOTH embeddable entities to admit the metadata-only re-embed path. The */ /* value list is derived by CodeGen from these CHECK constraints, so each is replaced wholesale */ /* rather than edited. */;

ALTER TABLE __mj."ContentItem"
  ADD CONSTRAINT "CK_ContentItem_EmbeddingStatus" CHECK ("EmbeddingStatus" IN (
    'Pending',
    'Processing',
    'Processed',
    'Complete',
    'Failed',
    'Skipped',
    'Active',
    'MetadataOnly'
  ));

ALTER TABLE __mj."ContentItemChunk"
DROP CONSTRAINT "CK_ContentItemChunk_EmbeddingStatus";

ALTER TABLE __mj."ContentItemChunk"
  ADD CONSTRAINT "CK_ContentItemChunk_EmbeddingStatus" CHECK ("EmbeddingStatus" IN (
    'Pending',
    'Processing',
    'Processed',
    'Complete',
    'Failed',
    'Skipped',
    'Active',
    'MetadataOnly'
  ));

ALTER TABLE __mj."ContentItemChunk"
ADD COLUMN "FieldConfidence" TEXT NULL, ADD COLUMN "Decorator" TEXT NULL /* --------------------------------------------------------------------------- */ /* Content Item Chunk */ /* --------------------------------------------------------------------------- */;

ALTER TABLE __mj."ContentSource"
  ADD COLUMN "FieldConfidence" TEXT NULL,
  ADD COLUMN "ForceDiscovery" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "LastDiscoveredAt" TIMESTAMPTZ NULL,
  ADD COLUMN "LastSyncedAt" TIMESTAMPTZ NULL
 /* --------------------------------------------------------------------------- */ /* Content Source */ /* --------------------------------------------------------------------------- */;

ALTER TABLE __mj."ContentType"
ADD COLUMN "ExtractorKey" VARCHAR(100) NULL /* --------------------------------------------------------------------------- */ /* Content Type — the per-type extractor default, beside SegmenterKey / CleanerKey */ /* --------------------------------------------------------------------------- */;

ALTER TABLE __mj."ContentFileType"
  ADD COLUMN "ByteSignature" TEXT NULL,
  ADD COLUMN "IsText" BOOLEAN NULL,
  ADD COLUMN "ExtractorKey" VARCHAR(100) NULL
 /* --------------------------------------------------------------------------- */ /* Content File Type — the detection rules, as data */ /* --------------------------------------------------------------------------- */ /* Which bytes identify a format, whether a format is text, and which extractor reads it are all */ /* facts about a file type, and they were all hardcoded. Moving the DATA to metadata while the */ /* matching code stays put means recognising a new format is a row, not a release; a deployment that */ /* needs a matcher the generic one cannot express still registers a signature class in code. */;

ALTER TABLE __mj."RecordProcess"
DROP CONSTRAINT "CK_RecordProcess_WorkType" /* --------------------------------------------------------------------------- */ /* Record Process — admit the pipeline's work type (phase F1) */ /* --------------------------------------------------------------------------- */;

ALTER TABLE __mj."RecordProcess"
  ADD CONSTRAINT "CK_RecordProcess_WorkType" CHECK ("WorkType" IN ('Action', 'Agent', 'Infer', 'FieldRules', 'ML Model', 'Clone', 'Pipeline Stage'));

COMMENT ON COLUMN __mj."ContentItem"."FieldConfidence" IS 'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it. Lets two stages that know nothing about each other resolve a shared field on merit rather than by running order.';

COMMENT ON COLUMN __mj."ContentItem"."ExtractionStatus" IS 'Status of the Extract stage for this item: Pending, Processing, Complete, Failed or Skipped.';

COMMENT ON COLUMN __mj."ContentItem"."SegmentationStatus" IS 'Status of the Segment stage for this item: Pending, Processing, Complete, Failed or Skipped.';

COMMENT ON COLUMN __mj."ContentItem"."DeleteStatus" IS 'Soft-delete marker: Pending once something has been removed at the source, Deleted once the Delete stage has cleaned up everything downstream of it. Marking rather than deleting keeps the outside-system cleanup in one place and makes it retryable.';

COMMENT ON COLUMN __mj."ContentItem"."ExtractorKey" IS 'The registered content extractor that actually read this item, recorded as a receipt of what ran. Distinct from the defaults on Content Type and in the source configuration, which say what should run.';

COMMENT ON COLUMN __mj."ContentItem"."ExtractorKeyOverride" IS 'Forces a specific content extractor for this item, overriding every default in the cascade. Set by a splitting extractor that already knows what one of its own children is, and by an operator correcting a misrouted item.';

COMMENT ON COLUMN __mj."ContentItem"."Modality" IS 'What kind of content this item holds: text, image, audio, video or multimodal. Determines whether the item can be embedded without extracted text.';

COMMENT ON COLUMN __mj."ContentItem"."Date" IS 'The date the content itself carries — published, issued or authored — as opposed to when this row was created.';

COMMENT ON COLUMN __mj."ContentItem"."Decorator" IS 'Text that accompanies this item so it still makes sense retrieved on its own. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the content.';

COMMENT ON COLUMN __mj."ContentItem"."FileID" IS 'The durable copy of the fetched artifact, held as an MJ File so the bytes live in whichever storage provider the source is configured for rather than in this database.';

COMMENT ON COLUMN __mj."ContentItemChunk"."FieldConfidence" IS 'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.';

COMMENT ON COLUMN __mj."ContentItemChunk"."Decorator" IS 'Text that accompanies this chunk so it still makes sense retrieved on its own — normally inherited from its parent item. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the chunk.';

COMMENT ON COLUMN __mj."ContentSource"."FieldConfidence" IS 'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.';

COMMENT ON COLUMN __mj."ContentSource"."ForceDiscovery" IS 'Walk this source on the next pass regardless of its schedule. A one-shot: the Discover stage clears it when the walk completes. Scheduling is deployment-owned and the shipped Discover process selects ForceDiscovery = 1, which is why there is no discovery status column to re-arm.';

COMMENT ON COLUMN __mj."ContentSource"."LastDiscoveredAt" IS 'When this source was last walked by the Discover stage. Stamped with the time a completed walk started, and passed back as Since on subsequent incremental walks.';

COMMENT ON COLUMN __mj."ContentSource"."LastSyncedAt" IS 'When this source last completed a full Sync walk (reconciling removals). Stamped with the time a completed sync walk started. The shipped Sync Record Process selects sources by LastSyncedAt (LastSyncedAt IS NULL OR LastSyncedAt < DATEADD(day, -30, GETUTCDATE())), never by ForceDiscovery; to force a sync, set LastSyncedAt back or to NULL.';

COMMENT ON COLUMN __mj."ContentType"."ExtractorKey" IS 'The default content extractor for items of this content type, beside SegmenterKey and CleanerKey. A per-type default has no home in a source''s Configuration, and reading it from a run''s Options would make it per-run.';

COMMENT ON COLUMN __mj."ContentFileType"."ByteSignature" IS 'How this file type is recognised from its own content, as JSON. Either magic bytes - {"Magic":[37,80,68,70],"Offset":0,"Unambiguous":true} - or, for a text format, the characters it opens with: {"TextPrefix":["<!doctype html","<html"]}, matched after a byte-order mark and leading whitespace are stripped and case is folded. Unambiguous means a match may override a declared type; a container format such as zip recognises without identifying, so it may not.';

COMMENT ON COLUMN __mj."ContentFileType"."IsText" IS 'Whether this file type is text. Decides whether an unrecognised file is attempted as plain text or routed down the multi-modal path. NULL means unknown, and the pipeline falls back to inspecting the bytes.';

COMMENT ON COLUMN __mj."ContentFileType"."ExtractorKey" IS 'The registered content extractor that reads this file type. Lets a deployment add support for a format by pointing its file type at an extractor, rather than editing the extractor''s own list of what it supports.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d3a9171-1c2f-432f-83c6-b6b56ea5f23a' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldConfidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d3a9171-1c2f-432f-83c6-b6b56ea5f23a', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Sources */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'), 'FieldConfidence', 'Field Confidence', 'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5c69e205-60b9-4d87-bd5e-0e6039960a35' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ForceDiscovery')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5c69e205-60b9-4d87-bd5e-0e6039960a35', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Sources */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'), 'ForceDiscovery', 'Force Discovery', 'Walk this source on the next pass regardless of its schedule. A one-shot: the Discover stage clears it when the walk completes. Sources selected for a Discover run are always walked; ForceDiscovery guarantees selection for filters that key off it.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '50e95077-8d9e-4b84-85b1-59fc267db466' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'LastDiscoveredAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('50e95077-8d9e-4b84-85b1-59fc267db466', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Sources */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'), 'LastDiscoveredAt', 'Last Discovered At', 'When this source was last walked by the Discover stage.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a3f290c1-44d8-4a12-9b81-11820c993b77' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'LastSyncedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a3f290c1-44d8-4a12-9b81-11820c993b77', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Sources */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'), 'LastSyncedAt', 'Last Synced At', 'When this source last completed a full Sync walk (reconciling removals). Stamped with the time a completed sync walk started. The shipped Sync Record Process selects sources by LastSyncedAt (LastSyncedAt IS NULL OR LastSyncedAt < DATEADD(day, -30, GETUTCDATE())), never by ForceDiscovery; to force a sync, set LastSyncedAt back or to NULL.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fe54d85e-203e-4115-b1e0-2b6d4cd0d165' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ExtractorKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fe54d85e-203e-4115-b1e0-2b6d4cd0d165', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'ExtractorKey', 'Extractor Key', 'The default content extractor for items of this content type, beside SegmenterKey and CleanerKey. A per-type default has no home in a source''s Configuration, and reading it from a run''s Options would make it per-run.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4dd79ce6-fcef-4fad-bbea-292302107a35' OR ("EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ByteSignature')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4dd79ce6-fcef-4fad-bbea-292302107a35', 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content File Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'ByteSignature', 'Byte Signature', 'How this file type is recognised from its own content, as JSON. Either magic bytes - {"Magic":[37,80,68,70],"Offset":0,"Unambiguous":true} - or, for a text format, the characters it opens with: {"TextPrefix":["<!doctype html","<html"]}, matched after a byte-order mark and leading whitespace are stripped and case is folded. Unambiguous means a match may override a declared type; a container format such as zip recognises without identifying, so it may not.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94be4148-af42-4b9c-86e7-722c2a8ab46e' OR ("EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'IsText')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94be4148-af42-4b9c-86e7-722c2a8ab46e', 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content File Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'IsText', 'Is Text', 'Whether this file type is text. Decides whether an unrecognised file is attempted as plain text or routed down the multi-modal path. NULL means unknown, and the pipeline falls back to inspecting the bytes.', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ca08721a-94c6-4e6e-b028-51e4d70d79bb' OR ("EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ExtractorKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ca08721a-94c6-4e6e-b028-51e4d70d79bb', 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content File Types */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'ExtractorKey', 'Extractor Key', 'The registered content extractor that reads this file type. Lets a deployment add support for a format by pointing its file type at an extractor, rather than editing the extractor''s own list of what it supports.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03f80c6e-96fb-4231-ad1a-e93a2bc2e4ce' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldConfidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03f80c6e-96fb-4231-ad1a-e93a2bc2e4ce', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'FieldConfidence', 'Field Confidence', 'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it. Lets two stages that know nothing about each other resolve a shared field on merit rather than by running order.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '45ca2d58-851a-478d-8f5d-ba17510c5b1c' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ExtractionStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('45ca2d58-851a-478d-8f5d-ba17510c5b1c', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'ExtractionStatus', 'Extraction Status', 'Status of the Extract stage for this item: Pending, Processing, Complete, Failed or Skipped.', 'nvarchar', 80, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4071157a-8d92-418f-a336-580e742af7f7' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'SegmentationStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4071157a-8d92-418f-a336-580e742af7f7', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'SegmentationStatus', 'Segmentation Status', 'Status of the Segment stage for this item: Pending, Processing, Complete, Failed or Skipped.', 'nvarchar', 80, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '210844c7-60a6-43e2-993a-fe6b5f71b321' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'DeleteStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('210844c7-60a6-43e2-993a-fe6b5f71b321', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'DeleteStatus', 'Delete Status', 'Soft-delete marker: Pending once something has been removed at the source, Deleted once the Delete stage has cleaned up everything downstream of it. Marking rather than deleting keeps the outside-system cleanup in one place and makes it retryable.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f77cc64d-b8ec-4d02-9bfa-b359880617e5' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ExtractorKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f77cc64d-b8ec-4d02-9bfa-b359880617e5', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'ExtractorKey', 'Extractor Key', 'The registered content extractor that actually read this item, recorded as a receipt of what ran. Distinct from the defaults on Content Type and in the source configuration, which say what should run.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bda71d18-f295-4970-8256-dc61bbcfc9d7' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'ExtractorKeyOverride')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bda71d18-f295-4970-8256-dc61bbcfc9d7', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'ExtractorKeyOverride', 'Extractor Key Override', 'Forces a specific content extractor for this item, overriding every default in the cascade. Set by a splitting extractor that already knows what one of its own children is, and by an operator correcting a misrouted item.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a5354f85-4fc7-473e-8173-974091be1afc' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Modality')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a5354f85-4fc7-473e-8173-974091be1afc', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'Modality', 'Modality', 'What kind of content this item holds: text, image, audio, video or multimodal. Determines whether the item can be embedded without extracted text.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94eb5623-2275-492c-9068-05787df29ddc' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Date')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94eb5623-2275-492c-9068-05787df29ddc', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'Date', 'Date', 'The date the content itself carries — published, issued or authored — as opposed to when this row was created.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5675b693-a7cf-4228-a55f-89156fb44f85' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Decorator')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5675b693-a7cf-4228-a55f-89156fb44f85', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'Decorator', 'Decorator', 'Text that accompanies this item so it still makes sense retrieved on its own. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the content.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7bd55d1a-2f27-4cb8-8886-b80334a7a2d9' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7bd55d1a-2f27-4cb8-8886-b80334a7a2d9', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'FileID', 'File ID', 'The durable copy of the fetched artifact, held as an MJ File so the bytes live in whichever storage provider the source is configured for rather than in this database.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c6ea7075-fcc3-4c4e-9d7f-7f01c83928d9' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'FieldConfidence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c6ea7075-fcc3-4c4e-9d7f-7f01c83928d9', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'), 'FieldConfidence', 'Field Confidence', 'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4eb566c-faed-47c9-bec1-5d8bd37577ae' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'Decorator')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c4eb566c-faed-47c9-bec1-5d8bd37577ae', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'), 'Decorator', 'Decorator', 'Text that accompanies this chunk so it still makes sense retrieved on its own — normally inherited from its parent item. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the chunk.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 1ee0ffa7-3805-42e6-9d2b-54745299343d */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1ee0ffa7-3805-42e6-9d2b-54745299343d',
    '45CA2D58-851A-478D-8F5D-BA17510C5B1C',
    1,
    'Complete',
    'Complete',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 1c390cdb-6e57-4870-9865-cd3ecb18b8a7 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1c390cdb-6e57-4870-9865-cd3ecb18b8a7',
    '45CA2D58-851A-478D-8F5D-BA17510C5B1C',
    2,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b5356c37-0939-4f6f-93cf-04f17f465a02 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b5356c37-0939-4f6f-93cf-04f17f465a02',
    '45CA2D58-851A-478D-8F5D-BA17510C5B1C',
    3,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9f65bcd2-c6d6-428a-be83-3db5bda85aed */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9f65bcd2-c6d6-428a-be83-3db5bda85aed',
    '45CA2D58-851A-478D-8F5D-BA17510C5B1C',
    4,
    'Processing',
    'Processing',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 90d1a135-9e19-4fc5-9607-2c715a5ebae6 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '90d1a135-9e19-4fc5-9607-2c715a5ebae6',
    '45CA2D58-851A-478D-8F5D-BA17510C5B1C',
    5,
    'Skipped',
    'Skipped',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 45CA2D58-851A-478D-8F5D-BA17510C5B1C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '45CA2D58-851A-478D-8F5D-BA17510C5B1C';
/* SQL text to insert entity field value with ID 07837efe-b9c6-4cc8-a135-49a66b49ee3c */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '07837efe-b9c6-4cc8-a135-49a66b49ee3c',
    '4071157A-8D92-418F-A336-580E742AF7F7',
    1,
    'Complete',
    'Complete',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6c1c792a-3151-4b36-8b9b-ca9476f2582e */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6c1c792a-3151-4b36-8b9b-ca9476f2582e',
    '4071157A-8D92-418F-A336-580E742AF7F7',
    2,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9bf85658-3994-401c-8180-736cd63e9ab5 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9bf85658-3994-401c-8180-736cd63e9ab5',
    '4071157A-8D92-418F-A336-580E742AF7F7',
    3,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0cd15372-d1d8-4869-8df1-d4c14084f975 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0cd15372-d1d8-4869-8df1-d4c14084f975',
    '4071157A-8D92-418F-A336-580E742AF7F7',
    4,
    'Processing',
    'Processing',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f9297c27-8426-4e27-8d54-c4ff5a4aca43 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f9297c27-8426-4e27-8d54-c4ff5a4aca43',
    '4071157A-8D92-418F-A336-580E742AF7F7',
    5,
    'Skipped',
    'Skipped',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 4071157A-8D92-418F-A336-580E742AF7F7 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4071157A-8D92-418F-A336-580E742AF7F7';
/* SQL text to insert entity field value with ID c0938bd9-4799-4b0b-bd18-10ff149efe36 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c0938bd9-4799-4b0b-bd18-10ff149efe36',
    '210844C7-60A6-43E2-993A-FE6B5F71B321',
    1,
    'Deleted',
    'Deleted',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6f4de2e3-36bc-4e66-9524-679009a81e4c */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6f4de2e3-36bc-4e66-9524-679009a81e4c',
    '210844C7-60A6-43E2-993A-FE6B5F71B321',
    2,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 210844C7-60A6-43E2-993A-FE6B5F71B321 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '210844C7-60A6-43E2-993A-FE6B5F71B321';
/* SQL text to insert entity field value with ID bf2c20e1-01d0-496c-a2ac-50bbbf72a0a6 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bf2c20e1-01d0-496c-a2ac-50bbbf72a0a6',
    'A5354F85-4FC7-473E-8173-974091BE1AFC',
    1,
    'audio',
    'audio',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 83d8515f-aa73-43de-9e2b-48ab8fe1d5c1 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '83d8515f-aa73-43de-9e2b-48ab8fe1d5c1',
    'A5354F85-4FC7-473E-8173-974091BE1AFC',
    2,
    'image',
    'image',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d3df6f0c-f0b7-4e5f-aab2-0f12afb02380 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd3df6f0c-f0b7-4e5f-aab2-0f12afb02380',
    'A5354F85-4FC7-473E-8173-974091BE1AFC',
    3,
    'multimodal',
    'multimodal',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f7705d89-dd82-42c4-8480-4e2feafe526a */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f7705d89-dd82-42c4-8480-4e2feafe526a',
    'A5354F85-4FC7-473E-8173-974091BE1AFC',
    4,
    'text',
    'text',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID dfd40ebf-6887-4a3c-99d6-2eaf4f732282 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'dfd40ebf-6887-4a3c-99d6-2eaf4f732282',
    'A5354F85-4FC7-473E-8173-974091BE1AFC',
    5,
    'video',
    'video',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID A5354F85-4FC7-473E-8173-974091BE1AFC */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'A5354F85-4FC7-473E-8173-974091BE1AFC';
/* SQL text to insert entity field value with ID 8ed2ed97-7084-490f-9edc-10a2ba075beb */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8ed2ed97-7084-490f-9edc-10a2ba075beb',
    '41209810-B679-44C8-82A1-A5A6E5057616',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e0607855-37bd-4192-bea0-869d529fcbbc */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e0607855-37bd-4192-bea0-869d529fcbbc',
    '41209810-B679-44C8-82A1-A5A6E5057616',
    4,
    'MetadataOnly',
    'MetadataOnly',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 196a42e2-5d2a-4b5c-8bc5-95dab3984130 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '196a42e2-5d2a-4b5c-8bc5-95dab3984130',
    '41209810-B679-44C8-82A1-A5A6E5057616',
    6,
    'Processed',
    'Processed',
    NOW(),
    NOW()
  );
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 2
WHERE
  "ID" = '5AB34197-997F-4C3C-9854-34264A662CF4';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 3
WHERE
  "ID" = 'D8BD4640-B599-4366-B29A-501FE8AEF307';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 5
WHERE
  "ID" = '603BFEB8-11E7-4D60-8C59-47F60AF071D9';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 7
WHERE
  "ID" = 'E34F46AA-1273-4E64-B876-322D1E3FFBD8';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 8
WHERE
  "ID" = '17027BA3-78F5-43D8-A6F5-5A8CEBB016B2';
/* SQL text to insert entity field value with ID cd7400a7-52c3-4f88-b0ad-2dd091a399b7 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'cd7400a7-52c3-4f88-b0ad-2dd091a399b7',
    '06DB407C-561A-4740-8A28-E93DC745435B',
    4,
    'MetadataOnly',
    'MetadataOnly',
    NOW(),
    NOW()
  );
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 5
WHERE
  "ID" = '270C2B63-34F2-4017-B044-82701E0BC763';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 6
WHERE
  "ID" = '172F3A14-3837-4B1D-8C10-329FB35C03D4';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 7
WHERE
  "ID" = 'E2E5BDEF-2C52-4CA1-A5D8-BD844F9B3E31';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 8
WHERE
  "ID" = '22A533C5-6622-4E19-8862-2F4133D8766D';
/* SQL text to insert entity field value with ID 089ab222-d7a5-4b28-9662-cbd51a488b43 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '089ab222-d7a5-4b28-9662-cbd51a488b43',
    '58345D95-711E-470F-BD28-1AA4AD8214D2',
    7,
    'Pipeline Stage',
    'Pipeline Stage',
    NOW(),
    NOW()
  );
/* Create Entity Relationship: MJ: Files -> MJ: Content Items (One To Many via FileID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '9b3ae2c6-7a46-4c7a-8f73-a136b788d26b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b3ae2c6-7a46-4c7a-8f73-a136b788d26b', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FileID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2efbf6ca-5f76-4333-871c-b6d969f773d7' OR ("EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'File')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2efbf6ca-5f76-4333-871c-b6d969f773d7', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Items */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'), 'File', 'File', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '45CA2D58-851A-478D-8F5D-BA17510C5B1C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'A5354F85-4FC7-473E-8173-974091BE1AFC'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '94EB5623-2275-492C-9068-05787DF29DDC'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '94BE4148-AF42-4B9C-86E7-722C2A8AB46E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'CA08721A-94C6-4E6E-B028-51E4D70D79BB'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: Content Types.ExtractorKey */
UPDATE __mj."EntityField" SET "Category" = 'Advanced Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FE54D85E-203E-4115-B1E0-2B6D4CD0D165';

/* Set categories for 6 fields */
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.FieldConfidence */
UPDATE __mj."EntityField" SET "Category" = 'Provenance', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'C6EA7075-FCC3-4C4E-9D7F-7F01C83928D9';
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Decorator */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Content', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C4EB566C-FAED-47C9-BEC1-5D8BD37577AE';
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDDepth */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D6EC061A-0723-4164-A86B-CD92D40649E7';
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDPath */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '41E24AC2-D11E-4EA5-970A-17EE2C315ACE';
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDIsLeaf */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A789631F-FA2D-437C-A099-3F726DBDB905';
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDChildCount */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3B61C881-E36E-4627-A6E5-15E6C89E4014';

/* Set categories for 8 fields */
/* UPDATE Entity Field Category Info MJ: Content File Types.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9DB8433E-F36B-1410-867F-007B559E242F';
/* UPDATE Entity Field Category Info MJ: Content File Types.Name */
UPDATE __mj."EntityField" SET "Category" = 'File Type Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A3B8433E-F36B-1410-867F-007B559E242F';
/* UPDATE Entity Field Category Info MJ: Content File Types.FileExtension */
UPDATE __mj."EntityField" SET "Category" = 'File Type Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A9B8433E-F36B-1410-867F-007B559E242F';
/* UPDATE Entity Field Category Info MJ: Content File Types.ByteSignature */
UPDATE __mj."EntityField" SET "Category" = 'Processing Rules', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '4DD79CE6-FCEF-4FAD-BBEA-292302107A35';
/* UPDATE Entity Field Category Info MJ: Content File Types.IsText */
UPDATE __mj."EntityField" SET "Category" = 'Processing Rules', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '94BE4148-AF42-4B9C-86E7-722C2A8AB46E';
/* UPDATE Entity Field Category Info MJ: Content File Types.ExtractorKey */
UPDATE __mj."EntityField" SET "Category" = 'Processing Rules', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CA08721A-94C6-4E6E-B028-51E4D70D79BB';
/* UPDATE Entity Field Category Info MJ: Content File Types.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AFB8433E-F36B-1410-867F-007B559E242F';
/* UPDATE Entity Field Category Info MJ: Content File Types.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B5B8433E-F36B-1410-867F-007B559E242F';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('46eabe1a-4c97-52ee-999b-685912b06cae', 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{
  "File Type Details": {
    "description": "Core identifying details for the content file type",
    "icon": "fa fa-file"
  },
  "Processing Rules": {
    "description": "Rules and extractors used to process and recognize the file format",
    "icon": "fa fa-cogs"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{
  "File Type Details": "fa fa-file",
  "Processing Rules": "fa fa-cogs",
  "System Metadata": "fa fa-cog"
}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22'
  AND "Name" = 'FieldCategoryIcons';

/* Set categories for 15 fields */
/* UPDATE Entity Field Category Info MJ: Content Items.FieldConfidence */
UPDATE __mj."EntityField" SET "Category" = 'AI & Vectorization', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '03F80C6E-96FB-4231-AD1A-E93A2BC2E4CE';
/* UPDATE Entity Field Category Info MJ: Content Items.ExtractionStatus */
UPDATE __mj."EntityField" SET "Category" = 'AI & Vectorization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '45CA2D58-851A-478D-8F5D-BA17510C5B1C';
/* UPDATE Entity Field Category Info MJ: Content Items.SegmentationStatus */
UPDATE __mj."EntityField" SET "Category" = 'AI & Vectorization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4071157A-8D92-418F-A336-580E742AF7F7';
/* UPDATE Entity Field Category Info MJ: Content Items.DeleteStatus */
UPDATE __mj."EntityField" SET "Category" = 'AI & Vectorization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '210844C7-60A6-43E2-993A-FE6B5F71B321';
/* UPDATE Entity Field Category Info MJ: Content Items.ExtractorKey */
UPDATE __mj."EntityField" SET "Category" = 'Source Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F77CC64D-B8EC-4D02-9BFA-B359880617E5';
/* UPDATE Entity Field Category Info MJ: Content Items.ExtractorKeyOverride */
UPDATE __mj."EntityField" SET "Category" = 'Source Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BDA71D18-F295-4970-8256-DC61BBCFC9D7';
/* UPDATE Entity Field Category Info MJ: Content Items.Modality */
UPDATE __mj."EntityField" SET "Category" = 'Content Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A5354F85-4FC7-473E-8173-974091BE1AFC';
/* UPDATE Entity Field Category Info MJ: Content Items.Date */
UPDATE __mj."EntityField" SET "Category" = 'Content Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Content Date'
WHERE
  "ID" = '94EB5623-2275-492C-9068-05787DF29DDC';
/* UPDATE Entity Field Category Info MJ: Content Items.Decorator */
UPDATE __mj."EntityField" SET "Category" = 'Content Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5675B693-A7CF-4228-A55F-89156FB44F85';
/* UPDATE Entity Field Category Info MJ: Content Items.FileID */
UPDATE __mj."EntityField" SET "Category" = 'Source Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'File'
WHERE
  "ID" = '7BD55D1A-2F27-4CB8-8886-B80334A7A2D9';
/* UPDATE Entity Field Category Info MJ: Content Items.File */
UPDATE __mj."EntityField" SET "Category" = 'Source Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'File Details'
WHERE
  "ID" = '2EFBF6CA-5F76-4333-871C-B6D969F773D7';
/* UPDATE Entity Field Category Info MJ: Content Items.ParentIDDepth */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C43C9BE7-B1B3-4C40-B17B-52C10CDEDB7A';
/* UPDATE Entity Field Category Info MJ: Content Items.ParentIDPath */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C68A5DBE-4BA0-4CE0-AD64-625A39D471B7';
/* UPDATE Entity Field Category Info MJ: Content Items.ParentIDIsLeaf */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BBCEFF38-E288-45E1-83EE-BAA1EC43C353';
/* UPDATE Entity Field Category Info MJ: Content Items.ParentIDChildCount */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6AA4A7B1-1663-4C86-A61E-796603E138D7';

/* Set categories for 4 fields */
/* UPDATE Entity Field Category Info MJ: Content Sources.FieldConfidence */
UPDATE __mj."EntityField" SET "Category" = 'Processing & Automation', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '2D3A9171-1C2F-432F-83C6-B6B56EA5F23A';
/* UPDATE Entity Field Category Info MJ: Content Sources.ForceDiscovery */
UPDATE __mj."EntityField" SET "Category" = 'Processing & Automation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5C69E205-60B9-4D87-BD5E-0E6039960A35';
/* UPDATE Entity Field Category Info MJ: Content Sources.LastDiscoveredAt */
UPDATE __mj."EntityField" SET "Category" = 'Processing & Automation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '50E95077-8D9E-4B84-85B1-59FC267DB466';
/* UPDATE Entity Field Category Info MJ: Content Sources.LastSyncedAt */
UPDATE __mj."EntityField" SET "Category" = 'Processing & Automation', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A3F290C1-44D8-4A12-9B81-11820C993B77';
