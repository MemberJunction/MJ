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
*/

-- ---------------------------------------------------------------------------
-- Content Item
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentItem ADD
    FieldConfidence NVARCHAR(MAX) NULL,
    ExtractionStatus NVARCHAR(40) NULL,
    SegmentationStatus NVARCHAR(40) NULL,
    DeleteStatus NVARCHAR(20) NULL,
    ExtractorKey NVARCHAR(100) NULL,
    ExtractorKeyOverride NVARCHAR(100) NULL,
    Modality NVARCHAR(20) NULL,
    [Date] DATETIMEOFFSET NULL,
    Decorator NVARCHAR(MAX) NULL,
    FileID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT CK_ContentItem_ExtractionStatus
    CHECK (ExtractionStatus IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped'));
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT CK_ContentItem_SegmentationStatus
    CHECK (SegmentationStatus IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped'));
GO

-- Deleted is terminal. The Delete stage owns the outside-system cleanup, so a row stays Pending
-- until that cleanup has actually run — there is deliberately no 'Complete'.
ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT CK_ContentItem_DeleteStatus
    CHECK (DeleteStatus IN ('Pending', 'Deleted'));
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT CK_ContentItem_Modality
    CHECK (Modality IN ('text', 'image', 'audio', 'video', 'multimodal'));
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT FK_ContentItem_File
    FOREIGN KEY (FileID) REFERENCES ${flyway:defaultSchema}.[File](ID);
GO

-- Existing rows have already been through extraction and segmentation under the autotagger, so
-- they are back-filled to a terminal status rather than left to queue for reprocessing. An item
-- with text has been extracted; one without never will be by re-running Extract over the same URL,
-- so it is Skipped rather than Pending. Segmentation is read from whether chunks exist.
UPDATE ci
    SET ExtractionStatus = CASE WHEN DATALENGTH(ci.Text) > 0 THEN 'Complete' ELSE 'Skipped' END,
        SegmentationStatus = CASE
            WHEN EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.ContentItemChunk c WHERE c.ContentItemID = ci.ID)
                THEN 'Complete'
            ELSE 'Skipped'
        END
FROM ${flyway:defaultSchema}.ContentItem ci;
GO

-- Widen EmbeddingStatus on BOTH embeddable entities to admit the metadata-only re-embed path. The
-- value list is derived by CodeGen from these CHECK constraints, so each is replaced wholesale
-- rather than edited.
ALTER TABLE ${flyway:defaultSchema}.ContentItem DROP CONSTRAINT CK_ContentItem_EmbeddingStatus;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT CK_ContentItem_EmbeddingStatus
    CHECK (EmbeddingStatus IN ('Pending', 'Processing', 'Processed', 'Complete', 'Failed', 'Skipped', 'Active', 'MetadataOnly'));
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItemChunk DROP CONSTRAINT CK_ContentItemChunk_EmbeddingStatus;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItemChunk
    ADD CONSTRAINT CK_ContentItemChunk_EmbeddingStatus
    CHECK (EmbeddingStatus IN ('Pending', 'Processing', 'Processed', 'Complete', 'Failed', 'Skipped', 'Active', 'MetadataOnly'));
GO

-- ---------------------------------------------------------------------------
-- Content Item Chunk
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentItemChunk ADD
    FieldConfidence NVARCHAR(MAX) NULL,
    Decorator NVARCHAR(MAX) NULL;
GO

-- ---------------------------------------------------------------------------
-- Content Source
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentSource ADD
    FieldConfidence NVARCHAR(MAX) NULL,
    ForceDiscovery BIT NOT NULL CONSTRAINT DF_ContentSource_ForceDiscovery DEFAULT (0),
    LastDiscoveredAt DATETIMEOFFSET NULL,
    LastSyncedAt DATETIMEOFFSET NULL;
GO

-- ---------------------------------------------------------------------------
-- Content Type — the per-type extractor default, beside SegmenterKey / CleanerKey
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentType ADD
    ExtractorKey NVARCHAR(100) NULL;
GO

-- ---------------------------------------------------------------------------
-- Content File Type — the detection rules, as data
-- ---------------------------------------------------------------------------
-- Which bytes identify a format, whether a format is text, and which extractor reads it are all
-- facts about a file type, and they were all hardcoded. Moving the DATA to metadata while the
-- matching code stays put means recognising a new format is a row, not a release; a deployment that
-- needs a matcher the generic one cannot express still registers a signature class in code.
ALTER TABLE ${flyway:defaultSchema}.ContentFileType ADD
    ByteSignature NVARCHAR(MAX) NULL,
    IsText BIT NULL,
    ExtractorKey NVARCHAR(100) NULL;
GO

-- ---------------------------------------------------------------------------
-- Record Process — admit the pipeline's work type (phase F1)
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.RecordProcess DROP CONSTRAINT CK_RecordProcess_WorkType;
GO

ALTER TABLE ${flyway:defaultSchema}.RecordProcess
    ADD CONSTRAINT CK_RecordProcess_WorkType
    CHECK (WorkType IN (N'Action', N'Agent', N'Infer', N'FieldRules', N'ML Model', N'Clone', N'Pipeline Stage'));
GO

-- ===========================================================================
-- Extended properties
-- ===========================================================================

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it. Lets two stages that know nothing about each other resolve a shared field on merit rather than by running order.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'FieldConfidence';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Status of the Extract stage for this item: Pending, Processing, Complete, Failed or Skipped.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'ExtractionStatus';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Status of the Segment stage for this item: Pending, Processing, Complete, Failed or Skipped.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'SegmentationStatus';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft-delete marker: Pending once something has been removed at the source, Deleted once the Delete stage has cleaned up everything downstream of it. Marking rather than deleting keeps the outside-system cleanup in one place and makes it retryable.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'DeleteStatus';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The registered content extractor that actually read this item, recorded as a receipt of what ran. Distinct from the defaults on Content Type and in the source configuration, which say what should run.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'ExtractorKey';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Forces a specific content extractor for this item, overriding every default in the cascade. Set by a splitting extractor that already knows what one of its own children is, and by an operator correcting a misrouted item.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'ExtractorKeyOverride';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'What kind of content this item holds: text, image, audio, video or multimodal. Determines whether the item can be embedded without extracted text.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'Modality';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The date the content itself carries — published, issued or authored — as opposed to when this row was created.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'Date';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Text that accompanies this item so it still makes sense retrieved on its own. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the content.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'Decorator';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The durable copy of the fetched artifact, held as an MJ File so the bytes live in whichever storage provider the source is configured for rather than in this database.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'FileID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItemChunk',
    @level2type = N'COLUMN', @level2name = 'FieldConfidence';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Text that accompanies this chunk so it still makes sense retrieved on its own — normally inherited from its parent item. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the chunk.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItemChunk',
    @level2type = N'COLUMN', @level2name = 'Decorator';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'FieldConfidence';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Walk this source on the next pass regardless of its schedule. A one-shot: the Discover stage clears it when the walk completes. Scheduling is deployment-owned and the shipped Discover process selects ForceDiscovery = 1, which is why there is no discovery status column to re-arm.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'ForceDiscovery';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When this source was last walked by the Discover stage. Stamped with the time a completed walk started, and passed back as Since on subsequent incremental walks.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'LastDiscoveredAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When this source last completed a full Sync walk (reconciling removals). Stamped with the time a completed sync walk started. The shipped Sync Record Process selects sources by LastSyncedAt (LastSyncedAt IS NULL OR LastSyncedAt < DATEADD(day, -30, GETUTCDATE())), never by ForceDiscovery; to force a sync, set LastSyncedAt back or to NULL.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'LastSyncedAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The default content extractor for items of this content type, beside SegmenterKey and CleanerKey. A per-type default has no home in a source''s Configuration, and reading it from a run''s Options would make it per-run.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentType',
    @level2type = N'COLUMN', @level2name = 'ExtractorKey';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'How this file type is recognised from its own content, as JSON. Either magic bytes - {"Magic":[37,80,68,70],"Offset":0,"Unambiguous":true} - or, for a text format, the characters it opens with: {"TextPrefix":["<!doctype html","<html"]}, matched after a byte-order mark and leading whitespace are stripped and case is folded. Unambiguous means a match may override a declared type; a container format such as zip recognises without identifying, so it may not.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentFileType',
    @level2type = N'COLUMN', @level2name = 'ByteSignature';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this file type is text. Decides whether an unrecognised file is attempted as plain text or routed down the multi-modal path. NULL means unknown, and the pipeline falls back to inspecting the bytes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentFileType',
    @level2type = N'COLUMN', @level2name = 'IsText';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The registered content extractor that reads this file type. Lets a deployment add support for a format by pointing its file type at an extractor, rather than editing the extractor''s own list of what it supports.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentFileType',
    @level2type = N'COLUMN', @level2name = 'ExtractorKey';























































/*****************************************************************************************
******************************************************************************************
***
***  EVERYTHING BELOW THIS POINT WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
***  DO NOT EDIT IT BY HAND.
***
***  For the entities whose schema the hand-written DDL above changed, it contains:
***    * EntityField INSERTs for the new columns (Sequence is an apply-time
***      MAX(Sequence)+1 expression, never a literal)
***    * regenerated base views, CRUD procedures and hierarchy functions
***    * FK indexes and permission grants
***
***  If the hand-written DDL above changes, DO NOT patch this section. Re-run
***  `mj codegen --skipfiles` against a database at this migration's schema and
***  replace this entire block with the fresh output.
***
******************************************************************************************
*****************************************************************************************/


/* SQL text to insert 20 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d3a9171-1c2f-432f-83c6-b6b56ea5f23a' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldConfidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2d3a9171-1c2f-432f-83c6-b6b56ea5f23a',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'FieldConfidence',
            'Field Confidence',
            'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c69e205-60b9-4d87-bd5e-0e6039960a35' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ForceDiscovery')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5c69e205-60b9-4d87-bd5e-0e6039960a35',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'ForceDiscovery',
            'Force Discovery',
            'Walk this source on the next pass regardless of its schedule. A one-shot: the Discover stage clears it when the walk completes. Sources selected for a Discover run are always walked; ForceDiscovery guarantees selection for filters that key off it.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50e95077-8d9e-4b84-85b1-59fc267db466' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastDiscoveredAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '50e95077-8d9e-4b84-85b1-59fc267db466',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'LastDiscoveredAt',
            'Last Discovered At',
            'When this source was last walked by the Discover stage.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3f290c1-44d8-4a12-9b81-11820c993b77' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a3f290c1-44d8-4a12-9b81-11820c993b77',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'LastSyncedAt',
            'Last Synced At',
            'When this source last completed a full Sync walk (reconciling removals). Stamped with the time a completed sync walk started. The shipped Sync Record Process selects sources by LastSyncedAt (LastSyncedAt IS NULL OR LastSyncedAt < DATEADD(day, -30, GETUTCDATE())), never by ForceDiscovery; to force a sync, set LastSyncedAt back or to NULL.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe54d85e-203e-4115-b1e0-2b6d4cd0d165' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fe54d85e-203e-4115-b1e0-2b6d4cd0d165',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKey',
            'Extractor Key',
            'The default content extractor for items of this content type, beside SegmenterKey and CleanerKey. A per-type default has no home in a source''s Configuration, and reading it from a run''s Options would make it per-run.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4dd79ce6-fcef-4fad-bbea-292302107a35' OR (EntityID = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ByteSignature')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4dd79ce6-fcef-4fad-bbea-292302107a35',
            'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content File Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ByteSignature',
            'Byte Signature',
            'How this file type is recognised from its own content, as JSON. Either magic bytes - {"Magic":[37,80,68,70],"Offset":0,"Unambiguous":true} - or, for a text format, the characters it opens with: {"TextPrefix":["<!doctype html","<html"]}, matched after a byte-order mark and leading whitespace are stripped and case is folded. Unambiguous means a match may override a declared type; a container format such as zip recognises without identifying, so it may not.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94be4148-af42-4b9c-86e7-722c2a8ab46e' OR (EntityID = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'IsText')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '94be4148-af42-4b9c-86e7-722c2a8ab46e',
            'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content File Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'IsText',
            'Is Text',
            'Whether this file type is text. Decides whether an unrecognised file is attempted as plain text or routed down the multi-modal path. NULL means unknown, and the pipeline falls back to inspecting the bytes.',
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca08721a-94c6-4e6e-b028-51e4d70d79bb' OR (EntityID = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca08721a-94c6-4e6e-b028-51e4d70d79bb',
            'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content File Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKey',
            'Extractor Key',
            'The registered content extractor that reads this file type. Lets a deployment add support for a format by pointing its file type at an extractor, rather than editing the extractor''s own list of what it supports.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03f80c6e-96fb-4231-ad1a-e93a2bc2e4ce' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldConfidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03f80c6e-96fb-4231-ad1a-e93a2bc2e4ce',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'FieldConfidence',
            'Field Confidence',
            'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it. Lets two stages that know nothing about each other resolve a shared field on merit rather than by running order.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45ca2d58-851a-478d-8f5d-ba17510c5b1c' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractionStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '45ca2d58-851a-478d-8f5d-ba17510c5b1c',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractionStatus',
            'Extraction Status',
            'Status of the Extract stage for this item: Pending, Processing, Complete, Failed or Skipped.',
            'nvarchar',
            80,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4071157a-8d92-418f-a336-580e742af7f7' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'SegmentationStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4071157a-8d92-418f-a336-580e742af7f7',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'SegmentationStatus',
            'Segmentation Status',
            'Status of the Segment stage for this item: Pending, Processing, Complete, Failed or Skipped.',
            'nvarchar',
            80,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '210844c7-60a6-43e2-993a-fe6b5f71b321' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'DeleteStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '210844c7-60a6-43e2-993a-fe6b5f71b321',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'DeleteStatus',
            'Delete Status',
            'Soft-delete marker: Pending once something has been removed at the source, Deleted once the Delete stage has cleaned up everything downstream of it. Marking rather than deleting keeps the outside-system cleanup in one place and makes it retryable.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f77cc64d-b8ec-4d02-9bfa-b359880617e5' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f77cc64d-b8ec-4d02-9bfa-b359880617e5',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKey',
            'Extractor Key',
            'The registered content extractor that actually read this item, recorded as a receipt of what ran. Distinct from the defaults on Content Type and in the source configuration, which say what should run.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bda71d18-f295-4970-8256-dc61bbcfc9d7' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKeyOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bda71d18-f295-4970-8256-dc61bbcfc9d7',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKeyOverride',
            'Extractor Key Override',
            'Forces a specific content extractor for this item, overriding every default in the cascade. Set by a splitting extractor that already knows what one of its own children is, and by an operator correcting a misrouted item.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5354f85-4fc7-473e-8173-974091be1afc' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Modality')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a5354f85-4fc7-473e-8173-974091be1afc',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'Modality',
            'Modality',
            'What kind of content this item holds: text, image, audio, video or multimodal. Determines whether the item can be embedded without extracted text.',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94eb5623-2275-492c-9068-05787df29ddc' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '94eb5623-2275-492c-9068-05787df29ddc',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'Date',
            'Date',
            'The date the content itself carries — published, issued or authored — as opposed to when this row was created.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5675b693-a7cf-4228-a55f-89156fb44f85' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Decorator')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5675b693-a7cf-4228-a55f-89156fb44f85',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'Decorator',
            'Decorator',
            'Text that accompanies this item so it still makes sense retrieved on its own. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the content.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bd55d1a-2f27-4cb8-8886-b80334a7a2d9' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FileID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7bd55d1a-2f27-4cb8-8886-b80334a7a2d9',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'FileID',
            'File ID',
            'The durable copy of the fetched artifact, held as an MJ File so the bytes live in whichever storage provider the source is configured for rather than in this database.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c6ea7075-fcc3-4c4e-9d7f-7f01c83928d9' OR (EntityID = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND Name = 'FieldConfidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c6ea7075-fcc3-4c4e-9d7f-7f01c83928d9',
            '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21', -- Entity: MJ: Content Item Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'),
            'FieldConfidence',
            'Field Confidence',
            'Per-field provenance for the pipeline: for each well-known field, the confidence the winning stage had and which stage set it.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4eb566c-faed-47c9-bec1-5d8bd37577ae' OR (EntityID = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND Name = 'Decorator')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c4eb566c-faed-47c9-bec1-5d8bd37577ae',
            '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21', -- Entity: MJ: Content Item Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'),
            'Decorator',
            'Decorator',
            'Text that accompanies this chunk so it still makes sense retrieved on its own — normally inherited from its parent item. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the chunk.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 1ee0ffa7-3805-42e6-9d2b-54745299343d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1ee0ffa7-3805-42e6-9d2b-54745299343d', '45CA2D58-851A-478D-8F5D-BA17510C5B1C', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1c390cdb-6e57-4870-9865-cd3ecb18b8a7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1c390cdb-6e57-4870-9865-cd3ecb18b8a7', '45CA2D58-851A-478D-8F5D-BA17510C5B1C', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b5356c37-0939-4f6f-93cf-04f17f465a02 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b5356c37-0939-4f6f-93cf-04f17f465a02', '45CA2D58-851A-478D-8F5D-BA17510C5B1C', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9f65bcd2-c6d6-428a-be83-3db5bda85aed */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f65bcd2-c6d6-428a-be83-3db5bda85aed', '45CA2D58-851A-478D-8F5D-BA17510C5B1C', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 90d1a135-9e19-4fc5-9607-2c715a5ebae6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('90d1a135-9e19-4fc5-9607-2c715a5ebae6', '45CA2D58-851A-478D-8F5D-BA17510C5B1C', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 45CA2D58-851A-478D-8F5D-BA17510C5B1C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='45CA2D58-851A-478D-8F5D-BA17510C5B1C';

/* SQL text to insert entity field value with ID 07837efe-b9c6-4cc8-a135-49a66b49ee3c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('07837efe-b9c6-4cc8-a135-49a66b49ee3c', '4071157A-8D92-418F-A336-580E742AF7F7', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6c1c792a-3151-4b36-8b9b-ca9476f2582e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6c1c792a-3151-4b36-8b9b-ca9476f2582e', '4071157A-8D92-418F-A336-580E742AF7F7', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9bf85658-3994-401c-8180-736cd63e9ab5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9bf85658-3994-401c-8180-736cd63e9ab5', '4071157A-8D92-418F-A336-580E742AF7F7', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0cd15372-d1d8-4869-8df1-d4c14084f975 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0cd15372-d1d8-4869-8df1-d4c14084f975', '4071157A-8D92-418F-A336-580E742AF7F7', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f9297c27-8426-4e27-8d54-c4ff5a4aca43 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f9297c27-8426-4e27-8d54-c4ff5a4aca43', '4071157A-8D92-418F-A336-580E742AF7F7', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4071157A-8D92-418F-A336-580E742AF7F7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4071157A-8D92-418F-A336-580E742AF7F7';

/* SQL text to insert entity field value with ID c0938bd9-4799-4b0b-bd18-10ff149efe36 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c0938bd9-4799-4b0b-bd18-10ff149efe36', '210844C7-60A6-43E2-993A-FE6B5F71B321', 1, 'Deleted', 'Deleted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6f4de2e3-36bc-4e66-9524-679009a81e4c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6f4de2e3-36bc-4e66-9524-679009a81e4c', '210844C7-60A6-43E2-993A-FE6B5F71B321', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 210844C7-60A6-43E2-993A-FE6B5F71B321 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='210844C7-60A6-43E2-993A-FE6B5F71B321';

/* SQL text to insert entity field value with ID bf2c20e1-01d0-496c-a2ac-50bbbf72a0a6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bf2c20e1-01d0-496c-a2ac-50bbbf72a0a6', 'A5354F85-4FC7-473E-8173-974091BE1AFC', 1, 'audio', 'audio', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 83d8515f-aa73-43de-9e2b-48ab8fe1d5c1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('83d8515f-aa73-43de-9e2b-48ab8fe1d5c1', 'A5354F85-4FC7-473E-8173-974091BE1AFC', 2, 'image', 'image', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d3df6f0c-f0b7-4e5f-aab2-0f12afb02380 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d3df6f0c-f0b7-4e5f-aab2-0f12afb02380', 'A5354F85-4FC7-473E-8173-974091BE1AFC', 3, 'multimodal', 'multimodal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f7705d89-dd82-42c4-8480-4e2feafe526a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f7705d89-dd82-42c4-8480-4e2feafe526a', 'A5354F85-4FC7-473E-8173-974091BE1AFC', 4, 'text', 'text', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dfd40ebf-6887-4a3c-99d6-2eaf4f732282 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dfd40ebf-6887-4a3c-99d6-2eaf4f732282', 'A5354F85-4FC7-473E-8173-974091BE1AFC', 5, 'video', 'video', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A5354F85-4FC7-473E-8173-974091BE1AFC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A5354F85-4FC7-473E-8173-974091BE1AFC';

/* SQL text to insert entity field value with ID 8ed2ed97-7084-490f-9edc-10a2ba075beb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8ed2ed97-7084-490f-9edc-10a2ba075beb', '41209810-B679-44C8-82A1-A5A6E5057616', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e0607855-37bd-4192-bea0-869d529fcbbc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e0607855-37bd-4192-bea0-869d529fcbbc', '41209810-B679-44C8-82A1-A5A6E5057616', 4, 'MetadataOnly', 'MetadataOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 196a42e2-5d2a-4b5c-8bc5-95dab3984130 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('196a42e2-5d2a-4b5c-8bc5-95dab3984130', '41209810-B679-44C8-82A1-A5A6E5057616', 6, 'Processed', 'Processed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='5AB34197-997F-4C3C-9854-34264A662CF4';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='D8BD4640-B599-4366-B29A-501FE8AEF307';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='603BFEB8-11E7-4D60-8C59-47F60AF071D9';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=7 WHERE ID='E34F46AA-1273-4E64-B876-322D1E3FFBD8';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=8 WHERE ID='17027BA3-78F5-43D8-A6F5-5A8CEBB016B2';

/* SQL text to insert entity field value with ID cd7400a7-52c3-4f88-b0ad-2dd091a399b7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cd7400a7-52c3-4f88-b0ad-2dd091a399b7', '06DB407C-561A-4740-8A28-E93DC745435B', 4, 'MetadataOnly', 'MetadataOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='270C2B63-34F2-4017-B044-82701E0BC763';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='172F3A14-3837-4B1D-8C10-329FB35C03D4';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=7 WHERE ID='E2E5BDEF-2C52-4CA1-A5D8-BD844F9B3E31';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=8 WHERE ID='22A533C5-6622-4E19-8862-2F4133D8766D';

/* SQL text to insert entity field value with ID 089ab222-d7a5-4b28-9662-cbd51a488b43 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('089ab222-d7a5-4b28-9662-cbd51a488b43', '58345D95-711E-470F-BD28-1AA4AD8214D2', 7, 'Pipeline Stage', 'Pipeline Stage', GETUTCDATE(), GETUTCDATE());


/* Create Entity Relationship: MJ: Files -> MJ: Content Items (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9b3ae2c6-7a46-4c7a-8f73-a136b788d26b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9b3ae2c6-7a46-4c7a-8f73-a136b788d26b', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FileID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ContentFileType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content File Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for ContentItemChunk */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentItemID in table ContentItemChunk
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemChunk_ContentItemID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemChunk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemChunk_ContentItemID ON [${flyway:defaultSchema}].[ContentItemChunk] ([ContentItemID]);

-- Index for foreign key ParentChunkID in table ContentItemChunk
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemChunk_ParentChunkID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemChunk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemChunk_ParentChunkID ON [${flyway:defaultSchema}].[ContentItemChunk] ([ParentChunkID]);

/* Index for Foreign Keys for ContentItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentSourceID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceID ON [${flyway:defaultSchema}].[ContentItem] ([ContentSourceID]);

-- Index for foreign key ContentTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentItem] ([ContentFileTypeID]);

-- Index for foreign key EntityRecordDocumentID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_EntityRecordDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_EntityRecordDocumentID ON [${flyway:defaultSchema}].[ContentItem] ([EntityRecordDocumentID]);

-- Index for foreign key EmbeddingModelID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentItem] ([EmbeddingModelID]);

-- Index for foreign key ParentID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_ParentID ON [${flyway:defaultSchema}].[ContentItem] ([ParentID]);

-- Index for foreign key FileID in table ContentItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItem_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItem_FileID ON [${flyway:defaultSchema}].[ContentItem] ([FileID]);

/* SQL text to update entity field related entity name field map for entity field ID 7BD55D1A-2F27-4CB8-8886-B80334A7A2D9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7BD55D1A-2F27-4CB8-8886-B80334A7A2D9', @RelatedEntityNameFieldMap='File';

/* Base View SQL for MJ: Content File Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content File Types
-- Item: vwContentFileTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content File Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentFileType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentFileTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentFileTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentFileTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentFileType] AS c
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content File Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content File Types
-- Item: Permissions for vwContentFileTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentFileTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content File Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content File Types
-- Item: spCreateContentFileType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentFileType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentFileType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentFileType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentFileType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @FileExtension_Clear bit = 0,
    @FileExtension nvarchar(255) = NULL,
    @ByteSignature_Clear bit = 0,
    @ByteSignature nvarchar(MAX) = NULL,
    @IsText_Clear bit = 0,
    @IsText bit = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentFileType]
            (
                [ID],
                [Name],
                [FileExtension],
                [ByteSignature],
                [IsText],
                [ExtractorKey]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @FileExtension_Clear = 1 THEN NULL ELSE ISNULL(@FileExtension, NULL) END,
                CASE WHEN @ByteSignature_Clear = 1 THEN NULL ELSE ISNULL(@ByteSignature, NULL) END,
                CASE WHEN @IsText_Clear = 1 THEN NULL ELSE ISNULL(@IsText, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentFileType]
            (
                [Name],
                [FileExtension],
                [ByteSignature],
                [IsText],
                [ExtractorKey]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @FileExtension_Clear = 1 THEN NULL ELSE ISNULL(@FileExtension, NULL) END,
                CASE WHEN @ByteSignature_Clear = 1 THEN NULL ELSE ISNULL(@ByteSignature, NULL) END,
                CASE WHEN @IsText_Clear = 1 THEN NULL ELSE ISNULL(@IsText, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentFileTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentFileType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentFileType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentFileType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content File Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentFileType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentFileType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentFileType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content File Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content File Types
-- Item: spUpdateContentFileType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentFileType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentFileType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentFileType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentFileType]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @FileExtension_Clear bit = 0,
    @FileExtension nvarchar(255) = NULL,
    @ByteSignature_Clear bit = 0,
    @ByteSignature nvarchar(MAX) = NULL,
    @IsText_Clear bit = 0,
    @IsText bit = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentFileType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [FileExtension] = CASE WHEN @FileExtension_Clear = 1 THEN NULL ELSE ISNULL(@FileExtension, [FileExtension]) END,
        [ByteSignature] = CASE WHEN @ByteSignature_Clear = 1 THEN NULL ELSE ISNULL(@ByteSignature, [ByteSignature]) END,
        [IsText] = CASE WHEN @IsText_Clear = 1 THEN NULL ELSE ISNULL(@IsText, [IsText]) END,
        [ExtractorKey] = CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, [ExtractorKey]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentFileTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentFileTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentFileType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentFileType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentFileType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentFileType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentFileType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentFileType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentFileType
ON [${flyway:defaultSchema}].[ContentFileType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentFileType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentFileType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content File Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentFileType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentFileType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentFileType] TO [cdp_Developer], [cdp_Integration];

/* Hierarchy Metadata Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentChunkID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentChunkID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentChunkID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ContentItemChunk] WHERE [ParentChunkID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ContentItemChunk] WHERE [ParentChunkID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentChunkID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentChunkID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentChunkID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentChunkID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ContentItemChunk] WHERE [ParentChunkID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ContentItemChunk] WHERE [ParentChunkID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentChunkID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentChunkID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentChunkID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentChunkID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentChunkID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentChunkID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentChunkID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemChunks]
AS
SELECT
    c.*,
    MJContentItem_ContentItemID.[Name] AS [ContentItem],
    MJContentItemChunk_ParentChunkID.[SegmentTitle] AS [ParentChunk],
    hier_ParentChunkID.RootID AS [RootParentChunkID],
    hier_ParentChunkID.Depth AS [ParentChunkIDDepth],
    hier_ParentChunkID.Path AS [ParentChunkIDPath],
    hier_ParentChunkID.IsLeaf AS [ParentChunkIDIsLeaf],
    hier_ParentChunkID.ChildCount AS [ParentChunkIDChildCount]
FROM
    [${flyway:defaultSchema}].[ContentItemChunk] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ContentItemID
  ON
    [c].[ContentItemID] = MJContentItem_ContentItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentItemChunk] AS MJContentItemChunk_ParentChunkID
  ON
    [c].[ParentChunkID] = MJContentItemChunk_ParentChunkID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetHierarchyMeta]([c].[ID], [c].[ParentChunkID]) AS hier_ParentChunkID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Permissions for vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk]
    @ID uniqueidentifier = NULL,
    @ContentItemID uniqueidentifier,
    @Sequence int,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @Decorator_Clear bit = 0,
    @Decorator nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ID],
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID],
                [FieldConfidence],
                [Decorator]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID],
                [FieldConfidence],
                [Decorator]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Item Chunks */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk]
    @ID uniqueidentifier,
    @ContentItemID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @Decorator_Clear bit = 0,
    @Decorator nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        [ContentItemID] = ISNULL(@ContentItemID, [ContentItemID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Text] = CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, [Text]) END,
        [VectorRecordID] = CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, [VectorRecordID]) END,
        [EmbeddingStatus] = ISNULL(@EmbeddingStatus, [EmbeddingStatus]),
        [TaggingStatus] = ISNULL(@TaggingStatus, [TaggingStatus]),
        [DeleteStatus] = CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, [DeleteStatus]) END,
        [LastEmbeddedAt] = CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, [LastEmbeddedAt]) END,
        [LastTaggedAt] = CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, [LastTaggedAt]) END,
        [LastDeletedAt] = CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, [LastDeletedAt]) END,
        [Modality] = ISNULL(@Modality, [Modality]),
        [StartOffset] = CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, [StartOffset]) END,
        [EndOffset] = CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, [EndOffset]) END,
        [StartMs] = CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, [StartMs]) END,
        [EndMs] = CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, [EndMs]) END,
        [PageNumber] = CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, [PageNumber]) END,
        [SegmentTitle] = CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, [SegmentTitle]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Transcript] = CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, [Transcript]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [ParentChunkID] = CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, [ParentChunkID]) END,
        [FieldConfidence] = CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, [FieldConfidence]) END,
        [Decorator] = CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, [Decorator]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemChunks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemChunk]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemChunk];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemChunk
ON [${flyway:defaultSchema}].[ContentItemChunk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemChunk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Item Chunks */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content File Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content File Types
-- Item: spDeleteContentFileType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentFileType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentFileType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentFileType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentFileType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentFileType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentFileType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentFileType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentFileType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content File Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentFileType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentFileType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentFileType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemChunk]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Item Chunks */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* Hierarchy Metadata Function SQL for MJ: Content Items.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: fnContentItemParentID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [ContentItem].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemParentID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItem]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItem] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ContentItem] WHERE [ParentID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ContentItem] WHERE [ParentID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ: Content Items.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: fnContentItemParentID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [ContentItem].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemParentID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItem]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItem] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ContentItem] WHERE [ParentID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ContentItem] WHERE [ParentID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ: Content Items.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: fnContentItemParentID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [ContentItem].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemParentID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItem]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ContentItem] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ: Content Items.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: fnContentItemParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ContentItem].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItem]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItem] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItems]
AS
SELECT
    c.*,
    MJContentSource_ContentSourceID.[Name] AS [ContentSource],
    MJContentType_ContentTypeID.[Name] AS [ContentType],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    MJContentFileType_ContentFileTypeID.[Name] AS [ContentFileType],
    MJEntityRecordDocument_EntityRecordDocumentID.[RecordID] AS [EntityRecordDocument],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJContentItem_ParentID.[Name] AS [Parent],
    MJFile_FileID.[Name] AS [File],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[ContentItem] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS MJContentSource_ContentSourceID
  ON
    [c].[ContentSourceID] = MJContentSource_ContentSourceID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS MJContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = MJContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS MJContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = MJContentFileType_ContentFileTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityRecordDocument] AS MJEntityRecordDocument_EntityRecordDocumentID
  ON
    [c].[EntityRecordDocumentID] = MJEntityRecordDocument_EntityRecordDocumentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ParentID
  ON
    [c].[ParentID] = MJContentItem_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [c].[FileID] = MJFile_FileID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnContentItemParentID_GetHierarchyMeta]([c].[ID], [c].[ParentID]) AS hier_ParentID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItems] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItems] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItems] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: Permissions for vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItems] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItems] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentItems] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spCreateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItem]
    @ID uniqueidentifier = NULL,
    @ContentSourceID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(250) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum_Clear bit = 0,
    @Checksum nvarchar(100) = NULL,
    @URL nvarchar(2000),
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @EntityRecordDocumentID_Clear bit = 0,
    @EntityRecordDocumentID uniqueidentifier = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @DisplayLink_Clear bit = 0,
    @DisplayLink nvarchar(2000) = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @ExtractionStatus_Clear bit = 0,
    @ExtractionStatus nvarchar(40) = NULL,
    @SegmentationStatus_Clear bit = 0,
    @SegmentationStatus nvarchar(40) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL,
    @ExtractorKeyOverride_Clear bit = 0,
    @ExtractorKeyOverride nvarchar(100) = NULL,
    @Modality_Clear bit = 0,
    @Modality nvarchar(20) = NULL,
    @Date_Clear bit = 0,
    @Date datetimeoffset = NULL,
    @Decorator_Clear bit = 0,
    @Decorator nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItem]
            (
                [ID],
                [ContentSourceID],
                [Name],
                [Description],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [Checksum],
                [URL],
                [Text],
                [EntityRecordDocumentID],
                [EmbeddingStatus],
                [LastEmbeddedAt],
                [EmbeddingModelID],
                [TaggingStatus],
                [LastTaggedAt],
                [VectorRecordID],
                [ParentID],
                [DisplayLink],
                [FieldConfidence],
                [ExtractionStatus],
                [SegmentationStatus],
                [DeleteStatus],
                [ExtractorKey],
                [ExtractorKeyOverride],
                [Modality],
                [Date],
                [Decorator],
                [FileID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentSourceID,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                CASE WHEN @Checksum_Clear = 1 THEN NULL ELSE ISNULL(@Checksum, NULL) END,
                @URL,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @EntityRecordDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityRecordDocumentID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @DisplayLink_Clear = 1 THEN NULL ELSE ISNULL(@DisplayLink, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, NULL) END,
                CASE WHEN @SegmentationStatus_Clear = 1 THEN NULL ELSE ISNULL(@SegmentationStatus, NULL) END,
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END,
                CASE WHEN @ExtractorKeyOverride_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKeyOverride, NULL) END,
                CASE WHEN @Modality_Clear = 1 THEN NULL ELSE ISNULL(@Modality, NULL) END,
                CASE WHEN @Date_Clear = 1 THEN NULL ELSE ISNULL(@Date, NULL) END,
                CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItem]
            (
                [ContentSourceID],
                [Name],
                [Description],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [Checksum],
                [URL],
                [Text],
                [EntityRecordDocumentID],
                [EmbeddingStatus],
                [LastEmbeddedAt],
                [EmbeddingModelID],
                [TaggingStatus],
                [LastTaggedAt],
                [VectorRecordID],
                [ParentID],
                [DisplayLink],
                [FieldConfidence],
                [ExtractionStatus],
                [SegmentationStatus],
                [DeleteStatus],
                [ExtractorKey],
                [ExtractorKeyOverride],
                [Modality],
                [Date],
                [Decorator],
                [FileID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentSourceID,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                CASE WHEN @Checksum_Clear = 1 THEN NULL ELSE ISNULL(@Checksum, NULL) END,
                @URL,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @EntityRecordDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityRecordDocumentID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @DisplayLink_Clear = 1 THEN NULL ELSE ISNULL(@DisplayLink, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, NULL) END,
                CASE WHEN @SegmentationStatus_Clear = 1 THEN NULL ELSE ISNULL(@SegmentationStatus, NULL) END,
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END,
                CASE WHEN @ExtractorKeyOverride_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKeyOverride, NULL) END,
                CASE WHEN @Modality_Clear = 1 THEN NULL ELSE ISNULL(@Modality, NULL) END,
                CASE WHEN @Date_Clear = 1 THEN NULL ELSE ISNULL(@Date, NULL) END,
                CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Items */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spUpdateContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItem]
    @ID uniqueidentifier,
    @ContentSourceID uniqueidentifier = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(250) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ContentTypeID uniqueidentifier = NULL,
    @ContentSourceTypeID uniqueidentifier = NULL,
    @ContentFileTypeID uniqueidentifier = NULL,
    @Checksum_Clear bit = 0,
    @Checksum nvarchar(100) = NULL,
    @URL nvarchar(2000) = NULL,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @EntityRecordDocumentID_Clear bit = 0,
    @EntityRecordDocumentID uniqueidentifier = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @DisplayLink_Clear bit = 0,
    @DisplayLink nvarchar(2000) = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @ExtractionStatus_Clear bit = 0,
    @ExtractionStatus nvarchar(40) = NULL,
    @SegmentationStatus_Clear bit = 0,
    @SegmentationStatus nvarchar(40) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL,
    @ExtractorKeyOverride_Clear bit = 0,
    @ExtractorKeyOverride nvarchar(100) = NULL,
    @Modality_Clear bit = 0,
    @Modality nvarchar(20) = NULL,
    @Date_Clear bit = 0,
    @Date datetimeoffset = NULL,
    @Decorator_Clear bit = 0,
    @Decorator nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        [ContentSourceID] = ISNULL(@ContentSourceID, [ContentSourceID]),
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ContentTypeID] = ISNULL(@ContentTypeID, [ContentTypeID]),
        [ContentSourceTypeID] = ISNULL(@ContentSourceTypeID, [ContentSourceTypeID]),
        [ContentFileTypeID] = ISNULL(@ContentFileTypeID, [ContentFileTypeID]),
        [Checksum] = CASE WHEN @Checksum_Clear = 1 THEN NULL ELSE ISNULL(@Checksum, [Checksum]) END,
        [URL] = ISNULL(@URL, [URL]),
        [Text] = CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, [Text]) END,
        [EntityRecordDocumentID] = CASE WHEN @EntityRecordDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityRecordDocumentID, [EntityRecordDocumentID]) END,
        [EmbeddingStatus] = ISNULL(@EmbeddingStatus, [EmbeddingStatus]),
        [LastEmbeddedAt] = CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, [LastEmbeddedAt]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [TaggingStatus] = ISNULL(@TaggingStatus, [TaggingStatus]),
        [LastTaggedAt] = CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, [LastTaggedAt]) END,
        [VectorRecordID] = CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, [VectorRecordID]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [DisplayLink] = CASE WHEN @DisplayLink_Clear = 1 THEN NULL ELSE ISNULL(@DisplayLink, [DisplayLink]) END,
        [FieldConfidence] = CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, [FieldConfidence]) END,
        [ExtractionStatus] = CASE WHEN @ExtractionStatus_Clear = 1 THEN NULL ELSE ISNULL(@ExtractionStatus, [ExtractionStatus]) END,
        [SegmentationStatus] = CASE WHEN @SegmentationStatus_Clear = 1 THEN NULL ELSE ISNULL(@SegmentationStatus, [SegmentationStatus]) END,
        [DeleteStatus] = CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, [DeleteStatus]) END,
        [ExtractorKey] = CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, [ExtractorKey]) END,
        [ExtractorKeyOverride] = CASE WHEN @ExtractorKeyOverride_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKeyOverride, [ExtractorKeyOverride]) END,
        [Modality] = CASE WHEN @Modality_Clear = 1 THEN NULL ELSE ISNULL(@Modality, [Modality]) END,
        [Date] = CASE WHEN @Date_Clear = 1 THEN NULL ELSE ISNULL(@Date, [Date]) END,
        [Decorator] = CASE WHEN @Decorator_Clear = 1 THEN NULL ELSE ISNULL(@Decorator, [Decorator]) END,
        [FileID] = CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, [FileID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItem
ON [${flyway:defaultSchema}].[ContentItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Items */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: spDeleteContentItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Items */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ContentSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentFileTypeID]);

-- Index for foreign key EmbeddingModelID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentSource] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID ON [${flyway:defaultSchema}].[ContentSource] ([VectorIndexID]);

-- Index for foreign key EntityID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityID ON [${flyway:defaultSchema}].[ContentSource] ([EntityID]);

-- Index for foreign key EntityDocumentID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID ON [${flyway:defaultSchema}].[ContentSource] ([EntityDocumentID]);

-- Index for foreign key ScheduledJobID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ScheduledJobID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ScheduledJobID ON [${flyway:defaultSchema}].[ContentSource] ([ScheduledJobID]);

/* Index for Foreign Keys for ContentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIModelID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_AIModelID ON [${flyway:defaultSchema}].[ContentType] ([AIModelID]);

-- Index for foreign key EmbeddingModelID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentType] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentType_VectorIndexID ON [${flyway:defaultSchema}].[ContentType] ([VectorIndexID]);

/* Base View SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentSources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentSources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSources]
AS
SELECT
    c.*,
    MJContentType_ContentTypeID.[Name] AS [ContentType],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    MJContentFileType_ContentFileTypeID.[Name] AS [ContentFileType],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex],
    MJEntity_EntityID.[Name] AS [Entity],
    MJEntityDocument_EntityDocumentID.[Name] AS [EntityDocument],
    MJScheduledJob_ScheduledJobID.[Name] AS [ScheduledJob]
FROM
    [${flyway:defaultSchema}].[ContentSource] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS MJContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = MJContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS MJContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = MJContentFileType_ContentFileTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [c].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS MJEntityDocument_EntityDocumentID
  ON
    [c].[EntityDocumentID] = MJEntityDocument_EntityDocumentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ScheduledJob] AS MJScheduledJob_ScheduledJobID
  ON
    [c].[ScheduledJobID] = MJScheduledJob_ScheduledJobID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource]
    @ID uniqueidentifier = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @EntityDocumentID_Clear bit = 0,
    @EntityDocumentID uniqueidentifier = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ScheduledJobID_Clear bit = 0,
    @ScheduledJobID uniqueidentifier = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @ForceDiscovery bit = NULL,
    @LastDiscoveredAt_Clear bit = 0,
    @LastDiscoveredAt datetimeoffset = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [ID],
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID],
                [SegmenterKey],
                [CleanerKey],
                [ScheduledJobID],
                [FieldConfidence],
                [ForceDiscovery],
                [LastDiscoveredAt],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                ISNULL(@ForceDiscovery, 0),
                CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID],
                [SegmenterKey],
                [CleanerKey],
                [ScheduledJobID],
                [FieldConfidence],
                [ForceDiscovery],
                [LastDiscoveredAt],
                [LastSyncedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                ISNULL(@ForceDiscovery, 0),
                CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource]
    @ID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContentTypeID uniqueidentifier = NULL,
    @ContentSourceTypeID uniqueidentifier = NULL,
    @ContentFileTypeID uniqueidentifier = NULL,
    @URL nvarchar(2000) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @EntityDocumentID_Clear bit = 0,
    @EntityDocumentID uniqueidentifier = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ScheduledJobID_Clear bit = 0,
    @ScheduledJobID uniqueidentifier = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @ForceDiscovery bit = NULL,
    @LastDiscoveredAt_Clear bit = 0,
    @LastDiscoveredAt datetimeoffset = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [ContentTypeID] = ISNULL(@ContentTypeID, [ContentTypeID]),
        [ContentSourceTypeID] = ISNULL(@ContentSourceTypeID, [ContentSourceTypeID]),
        [ContentFileTypeID] = ISNULL(@ContentFileTypeID, [ContentFileTypeID]),
        [URL] = ISNULL(@URL, [URL]),
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [VectorIndexID] = CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, [VectorIndexID]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [EntityDocumentID] = CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, [EntityDocumentID]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [CleanerKey] = CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, [CleanerKey]) END,
        [ScheduledJobID] = CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, [ScheduledJobID]) END,
        [FieldConfidence] = CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, [FieldConfidence]) END,
        [ForceDiscovery] = ISNULL(@ForceDiscovery, [ForceDiscovery]),
        [LastDiscoveredAt] = CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, [LastDiscoveredAt]) END,
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSource
ON [${flyway:defaultSchema}].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentTypes]
AS
SELECT
    c.*,
    MJAIModel_AIModelID.[Name] AS [AIModel],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[ContentType] AS c
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_AIModelID
  ON
    [c].[AIModelID] = MJAIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Permissions for vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spCreateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentType]
            (
                [ID],
                [Name],
                [Description],
                [AIModelID],
                [MinTags],
                [MaxTags],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [SegmenterKey],
                [CleanerKey],
                [ExtractorKey]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @AIModelID,
                @MinTags,
                @MaxTags,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentType]
            (
                [Name],
                [Description],
                [AIModelID],
                [MinTags],
                [MaxTags],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [SegmenterKey],
                [CleanerKey],
                [ExtractorKey]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @AIModelID,
                @MinTags,
                @MaxTags,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spUpdateContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentType]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AIModelID uniqueidentifier = NULL,
    @MinTags int = NULL,
    @MaxTags int = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [AIModelID] = ISNULL(@AIModelID, [AIModelID]),
        [MinTags] = ISNULL(@MinTags, [MinTags]),
        [MaxTags] = ISNULL(@MaxTags, [MaxTags]),
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [VectorIndexID] = CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, [VectorIndexID]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [CleanerKey] = CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, [CleanerKey]) END,
        [ExtractorKey] = CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, [ExtractorKey]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentType
ON [${flyway:defaultSchema}].[ContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: spDeleteContentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocument
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityDocument]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocument];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityDocument]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ContentSource using cursor to call spUpdateContentSource
    DECLARE @MJContentSources_EntityDocumentIDID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_Name nvarchar(255)
    DECLARE @MJContentSources_EntityDocumentID_ContentTypeID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_ContentSourceTypeID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_ContentFileTypeID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_URL nvarchar(2000)
    DECLARE @MJContentSources_EntityDocumentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_VectorIndexID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_Configuration nvarchar(MAX)
    DECLARE @MJContentSources_EntityDocumentID_EntityID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_EntityDocumentID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_SegmenterKey nvarchar(100)
    DECLARE @MJContentSources_EntityDocumentID_CleanerKey nvarchar(100)
    DECLARE @MJContentSources_EntityDocumentID_ScheduledJobID uniqueidentifier
    DECLARE @MJContentSources_EntityDocumentID_FieldConfidence nvarchar(MAX)
    DECLARE @MJContentSources_EntityDocumentID_ForceDiscovery bit
    DECLARE @MJContentSources_EntityDocumentID_LastDiscoveredAt datetimeoffset
    DECLARE @MJContentSources_EntityDocumentID_LastSyncedAt datetimeoffset
    DECLARE cascade_update_MJContentSources_EntityDocumentID_cursor CURSOR FOR
        SELECT [ID], [Name], [ContentTypeID], [ContentSourceTypeID], [ContentFileTypeID], [URL], [EmbeddingModelID], [VectorIndexID], [Configuration], [EntityID], [EntityDocumentID], [SegmenterKey], [CleanerKey], [ScheduledJobID], [FieldConfidence], [ForceDiscovery], [LastDiscoveredAt], [LastSyncedAt]
        FROM [${flyway:defaultSchema}].[ContentSource]
        WHERE [EntityDocumentID] = @ID

    OPEN cascade_update_MJContentSources_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID, @MJContentSources_EntityDocumentID_FieldConfidence, @MJContentSources_EntityDocumentID_ForceDiscovery, @MJContentSources_EntityDocumentID_LastDiscoveredAt, @MJContentSources_EntityDocumentID_LastSyncedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJContentSources_EntityDocumentID_EntityDocumentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateContentSource] @ID = @MJContentSources_EntityDocumentIDID, @Name = @MJContentSources_EntityDocumentID_Name, @ContentTypeID = @MJContentSources_EntityDocumentID_ContentTypeID, @ContentSourceTypeID = @MJContentSources_EntityDocumentID_ContentSourceTypeID, @ContentFileTypeID = @MJContentSources_EntityDocumentID_ContentFileTypeID, @URL = @MJContentSources_EntityDocumentID_URL, @EmbeddingModelID = @MJContentSources_EntityDocumentID_EmbeddingModelID, @VectorIndexID = @MJContentSources_EntityDocumentID_VectorIndexID, @Configuration = @MJContentSources_EntityDocumentID_Configuration, @EntityID = @MJContentSources_EntityDocumentID_EntityID, @EntityDocumentID_Clear = 1, @EntityDocumentID = @MJContentSources_EntityDocumentID_EntityDocumentID, @SegmenterKey = @MJContentSources_EntityDocumentID_SegmenterKey, @CleanerKey = @MJContentSources_EntityDocumentID_CleanerKey, @ScheduledJobID = @MJContentSources_EntityDocumentID_ScheduledJobID, @FieldConfidence = @MJContentSources_EntityDocumentID_FieldConfidence, @ForceDiscovery = @MJContentSources_EntityDocumentID_ForceDiscovery, @LastDiscoveredAt = @MJContentSources_EntityDocumentID_LastDiscoveredAt, @LastSyncedAt = @MJContentSources_EntityDocumentID_LastSyncedAt

        FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID, @MJContentSources_EntityDocumentID_FieldConfidence, @MJContentSources_EntityDocumentID_ForceDiscovery, @MJContentSources_EntityDocumentID_LastDiscoveredAt, @MJContentSources_EntityDocumentID_LastSyncedAt
    END

    CLOSE cascade_update_MJContentSources_EntityDocumentID_cursor
    DEALLOCATE cascade_update_MJContentSources_EntityDocumentID_cursor
    
    -- Cascade delete from EntityDocumentRun using cursor to call spDeleteEntityDocumentRun
    DECLARE @MJEntityDocumentRuns_EntityDocumentIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityDocumentRun]
        WHERE [EntityDocumentID] = @ID
    
    OPEN cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor INTO @MJEntityDocumentRuns_EntityDocumentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityDocumentRun] @ID = @MJEntityDocumentRuns_EntityDocumentIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor INTO @MJEntityDocumentRuns_EntityDocumentIDID
    END
    
    CLOSE cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor
    DEALLOCATE cascade_delete_MJEntityDocumentRuns_EntityDocumentID_cursor
    
    -- Cascade delete from EntityDocumentSetting using cursor to call spDeleteEntityDocumentSetting
    DECLARE @MJEntityDocumentSettings_EntityDocumentIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityDocumentSetting]
        WHERE [EntityDocumentID] = @ID
    
    OPEN cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor INTO @MJEntityDocumentSettings_EntityDocumentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityDocumentSetting] @ID = @MJEntityDocumentSettings_EntityDocumentIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor INTO @MJEntityDocumentSettings_EntityDocumentIDID
    END
    
    CLOSE cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor
    DEALLOCATE cascade_delete_MJEntityDocumentSettings_EntityDocumentID_cursor
    
    -- Cascade delete from EntityRecordDocument using cursor to call spDeleteEntityRecordDocument
    DECLARE @MJEntityRecordDocuments_EntityDocumentIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityRecordDocument]
        WHERE [EntityDocumentID] = @ID
    
    OPEN cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor INTO @MJEntityRecordDocuments_EntityDocumentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityRecordDocument] @ID = @MJEntityRecordDocuments_EntityDocumentIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor INTO @MJEntityRecordDocuments_EntityDocumentIDID
    END
    
    CLOSE cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor
    DEALLOCATE cascade_delete_MJEntityRecordDocuments_EntityDocumentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[EntityDocument]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Documents */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityDocument] TO [cdp_Integration], [cdp_Developer];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2efbf6ca-5f76-4333-871c-b6d969f773d7' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'File')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2efbf6ca-5f76-4333-871c-b6d969f773d7',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'File',
            'File',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '45CA2D58-851A-478D-8F5D-BA17510C5B1C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A5354F85-4FC7-473E-8173-974091BE1AFC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '94EB5623-2275-492C-9068-05787DF29DDC'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '94BE4148-AF42-4B9C-86E7-722C2A8AB46E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CA08721A-94C6-4E6E-B028-51E4D70D79BB'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: Content Types.ExtractorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FE54D85E-203E-4115-B1E0-2B6D4CD0D165';

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provenance',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'C6EA7075-FCC3-4C4E-9D7F-7F01C83928D9';

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Decorator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Content',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C4EB566C-FAED-47C9-BEC1-5D8BD37577AE';

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDDepth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D6EC061A-0723-4164-A86B-CD92D40649E7';

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '41E24AC2-D11E-4EA5-970A-17EE2C315ACE';

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDIsLeaf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A789631F-FA2D-437C-A099-3F726DBDB905';

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkIDChildCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3B61C881-E36E-4627-A6E5-15E6C89E4014';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Content File Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9DB8433E-F36B-1410-867F-007B559E242F';

-- UPDATE Entity Field Category Info MJ: Content File Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A3B8433E-F36B-1410-867F-007B559E242F';

-- UPDATE Entity Field Category Info MJ: Content File Types.FileExtension 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'File Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A9B8433E-F36B-1410-867F-007B559E242F';

-- UPDATE Entity Field Category Info MJ: Content File Types.ByteSignature 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '4DD79CE6-FCEF-4FAD-BBEA-292302107A35';

-- UPDATE Entity Field Category Info MJ: Content File Types.IsText 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '94BE4148-AF42-4B9C-86E7-722C2A8AB46E';

-- UPDATE Entity Field Category Info MJ: Content File Types.ExtractorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CA08721A-94C6-4E6E-B028-51E4D70D79BB';

-- UPDATE Entity Field Category Info MJ: Content File Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AFB8433E-F36B-1410-867F-007B559E242F';

-- UPDATE Entity Field Category Info MJ: Content File Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B5B8433E-F36B-1410-867F-007B559E242F';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('46eabe1a-4c97-52ee-999b-685912b06cae', 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{
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
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Update FieldCategoryIcons setting (legacy) */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "File Type Details": "fa fa-file",
  "Processing Rules": "fa fa-cogs",
  "System Metadata": "fa fa-cog"
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'B193AD50-0E66-EF11-A752-C0A5E8ACCB22' AND [Name] = 'FieldCategoryIcons';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Content Items.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '03F80C6E-96FB-4231-AD1A-E93A2BC2E4CE';

-- UPDATE Entity Field Category Info MJ: Content Items.ExtractionStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '45CA2D58-851A-478D-8F5D-BA17510C5B1C';

-- UPDATE Entity Field Category Info MJ: Content Items.SegmentationStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4071157A-8D92-418F-A336-580E742AF7F7';

-- UPDATE Entity Field Category Info MJ: Content Items.DeleteStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '210844C7-60A6-43E2-993A-FE6B5F71B321';

-- UPDATE Entity Field Category Info MJ: Content Items.ExtractorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F77CC64D-B8EC-4D02-9BFA-B359880617E5';

-- UPDATE Entity Field Category Info MJ: Content Items.ExtractorKeyOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BDA71D18-F295-4970-8256-DC61BBCFC9D7';

-- UPDATE Entity Field Category Info MJ: Content Items.Modality 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A5354F85-4FC7-473E-8173-974091BE1AFC';

-- UPDATE Entity Field Category Info MJ: Content Items.Date 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Date'
WHERE 
   ID = '94EB5623-2275-492C-9068-05787DF29DDC';

-- UPDATE Entity Field Category Info MJ: Content Items.Decorator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5675B693-A7CF-4228-A55F-89156FB44F85';

-- UPDATE Entity Field Category Info MJ: Content Items.FileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'File'
WHERE 
   ID = '7BD55D1A-2F27-4CB8-8886-B80334A7A2D9';

-- UPDATE Entity Field Category Info MJ: Content Items.File 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'File Details'
WHERE 
   ID = '2EFBF6CA-5F76-4333-871C-B6D969F773D7';

-- UPDATE Entity Field Category Info MJ: Content Items.ParentIDDepth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Hierarchy',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C43C9BE7-B1B3-4C40-B17B-52C10CDEDB7A';

-- UPDATE Entity Field Category Info MJ: Content Items.ParentIDPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Hierarchy',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C68A5DBE-4BA0-4CE0-AD64-625A39D471B7';

-- UPDATE Entity Field Category Info MJ: Content Items.ParentIDIsLeaf 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Hierarchy',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BBCEFF38-E288-45E1-83EE-BAA1EC43C353';

-- UPDATE Entity Field Category Info MJ: Content Items.ParentIDChildCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Hierarchy',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6AA4A7B1-1663-4C86-A61E-796603E138D7';

/* Set categories for 4 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '2D3A9171-1C2F-432F-83C6-B6B56EA5F23A';

-- UPDATE Entity Field Category Info MJ: Content Sources.ForceDiscovery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5C69E205-60B9-4D87-BD5E-0E6039960A35';

-- UPDATE Entity Field Category Info MJ: Content Sources.LastDiscoveredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '50E95077-8D9E-4B84-85B1-59FC267DB466';

-- UPDATE Entity Field Category Info MJ: Content Sources.LastSyncedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A3F290C1-44D8-4A12-9B81-11820C993B77';

