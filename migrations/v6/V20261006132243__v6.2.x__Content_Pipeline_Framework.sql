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
    * LastDiscoveredAt  — when the source was last walked
    * well-known fields — Date, Decorator and Modality on Content Item, Decorator on Content Item
                          Chunk
    * FileID            — the durable copy of a fetched artifact, as an MJ File

  Readiness for Discover is "schedule due OR ForceDiscovery", and a completed walk clears the bit.
  There is deliberately no DiscoveryStatus: a status column has to be re-armed to run again, which
  is a second mechanism for something the schedule already decides.

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

-- A URL identifies an item within its source. Without this, a re-walk racing a scheduled run (or
-- two triggers firing at once) creates a second item for the same URL, and every chunk and vector
-- below it is duplicated too. Filtered so that rows without a URL are unconstrained, and so that a
-- soft-deleted item does not block re-discovering the same URL later.
CREATE UNIQUE INDEX UQ_ContentItem_Source_URL
    ON ${flyway:defaultSchema}.ContentItem (ContentSourceID, URL)
    WHERE URL IS NOT NULL AND DeleteStatus IS NULL;
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
    LastDiscoveredAt DATETIMEOFFSET NULL;
GO

-- ---------------------------------------------------------------------------
-- Content Type — the per-type extractor default, beside SegmenterKey / CleanerKey
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentType ADD
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
    @value = N'Walk this source on the next pass regardless of its schedule. A one-shot: the Discover stage clears it when the walk completes. Readiness is "schedule due OR ForceDiscovery", which is why there is no discovery status column to re-arm.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'ForceDiscovery';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When this source was last walked by the Discover stage.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'LastDiscoveredAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The default content extractor for items of this content type, beside SegmenterKey and CleanerKey. A per-type default has no home in a source''s Configuration, and reading it from a run''s Options would make it per-run.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentType',
    @level2type = N'COLUMN', @level2name = 'ExtractorKey';
