/*
  Content Pipeline Framework — phase F0 schema.

  Adds the working-record substrate the content pipeline stages are built on:
    * FieldConfidence   — per-field provenance/confidence JSON on the three pipeline entities
    * stage statuses    — DiscoveryStatus on Content Source, and ExtractionStatus /
                          SegmentationStatus on Content Item alongside the existing
                          TaggingStatus / EmbeddingStatus
    * DeleteStatus      — soft-delete marker on Content Item, mirroring Content Item Chunk
    * well-known fields — Date, Decorator and Modality on Content Item, Decorator on Content Item
                          Chunk, completing the fixed set a working record maps onto real columns
                          (Text, FileType, ContentType, Title, Date, Modality, Decorator)
    * FileID            — the durable copy of a fetched artifact, held as an MJ File so it lands in
                          whichever storage provider the source is configured for
    * 'Pipeline Stage'  — a new Record Process WorkType
    * 'MetadataOnly'    — a new Content Item EmbeddingStatus value (metadata-only re-embed)

  Every change is additive. Naming follows the conventions already in these tables: SegmenterKey /
  CleanerKey establish the nvarchar(100) "registered class key" pattern, and the status columns on
  Content Item are nvarchar(40) over a five-value list.

  The stage-status columns are NULLable with no default ON PURPOSE. A NOT NULL DEFAULT 'Pending'
  back-fills every row that already exists, which on upgrade marks the entire existing corpus for
  reprocessing. NULL means "this row has never been through this stage", which is both true and
  cheap; the stages read NULL as Pending.
*/

-- ---------------------------------------------------------------------------
-- Content Item
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentItem ADD
    FieldConfidence NVARCHAR(MAX) NULL,
    ExtractionStatus NVARCHAR(40) NULL,
    SegmentationStatus NVARCHAR(40) NULL,
    DeleteStatus NVARCHAR(20) NULL,
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

-- Widen EmbeddingStatus to admit the metadata-only re-embed path (phase F13). The value list is
-- derived by CodeGen from this CHECK constraint, so it is replaced wholesale rather than edited.
ALTER TABLE ${flyway:defaultSchema}.ContentItem DROP CONSTRAINT CK_ContentItem_EmbeddingStatus;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT CK_ContentItem_EmbeddingStatus
    CHECK (EmbeddingStatus IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped', 'MetadataOnly'));
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
    DiscoveryStatus NVARCHAR(40) NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentSource
    ADD CONSTRAINT CK_ContentSource_DiscoveryStatus
    CHECK (DiscoveryStatus IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped'));
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
    @value = N'Status of the Extract stage for this item: Pending, Processing, Complete, Failed or Skipped. NULL means the item has never been through Extract.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'ExtractionStatus';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Status of the Segment stage for this item: Pending, Processing, Complete, Failed or Skipped. NULL means the item has never been through Segment.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'SegmentationStatus';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft-delete marker: Pending once something has been removed at the source, Deleted once the Delete stage has cleaned up everything downstream of it. Marking rather than deleting keeps the outside-system cleanup in one place and makes it retryable.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'DeleteStatus';

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
    @value = N'Status of the Discover stage for this source: Pending, Processing, Complete, Failed or Skipped. What makes a source ready to walk is its schedule; this records how the last walk ended. NULL means the source has never been walked by the pipeline.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'DiscoveryStatus';

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

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa690241-ef35-4446-b7a1-893def4e9e38' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldConfidence')) BEGIN
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
            'fa690241-ef35-4446-b7a1-893def4e9e38',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e21d688f-6c5a-46e9-b4c4-9a132cc4421a' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'DiscoveryStatus')) BEGIN
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
            'e21d688f-6c5a-46e9-b4c4-9a132cc4421a',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'DiscoveryStatus',
            'Discovery Status',
            'Status of the Discover stage for this source: Pending, Processing, Complete, Failed or Skipped. What makes a source ready to walk is its schedule; this records how the last walk ended. NULL means the source has never been walked by the pipeline.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '585b13c9-fadc-4707-93ec-ff4cad9b0f42' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldConfidence')) BEGIN
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
            '585b13c9-fadc-4707-93ec-ff4cad9b0f42',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cc3fe44-493c-44f8-863c-873485695c69' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractionStatus')) BEGIN
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
            '0cc3fe44-493c-44f8-863c-873485695c69',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractionStatus',
            'Extraction Status',
            'Status of the Extract stage for this item: Pending, Processing, Complete, Failed or Skipped. NULL means the item has never been through Extract.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '62c2e076-b2d0-4130-84c9-c0039758d20e' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'SegmentationStatus')) BEGIN
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
            '62c2e076-b2d0-4130-84c9-c0039758d20e',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'SegmentationStatus',
            'Segmentation Status',
            'Status of the Segment stage for this item: Pending, Processing, Complete, Failed or Skipped. NULL means the item has never been through Segment.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e27aa9c-1112-4324-9956-62096f6b9d5a' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'DeleteStatus')) BEGIN
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
            '9e27aa9c-1112-4324-9956-62096f6b9d5a',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a91b73a2-1616-4b5e-90ea-f769b95081fb' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Modality')) BEGIN
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
            'a91b73a2-1616-4b5e-90ea-f769b95081fb',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4681eca-9242-44af-9c8c-3f1d80e451d0' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Date')) BEGIN
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
            'd4681eca-9242-44af-9c8c-3f1d80e451d0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d33320c-92d2-44dd-8d38-c21b0435384f' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Decorator')) BEGIN
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
            '4d33320c-92d2-44dd-8d38-c21b0435384f',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78a87f3b-8a9c-43be-9b6a-3b4f6bb83e6a' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FileID')) BEGIN
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
            '78a87f3b-8a9c-43be-9b6a-3b4f6bb83e6a',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61ffcc16-9494-4a39-9663-a0850c60624e' OR (EntityID = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND Name = 'FieldConfidence')) BEGIN
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
            '61ffcc16-9494-4a39-9663-a0850c60624e',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '409e836d-258b-40c4-85a0-3a54304830d7' OR (EntityID = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND Name = 'Decorator')) BEGIN
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
            '409e836d-258b-40c4-85a0-3a54304830d7',
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

/* SQL text to insert entity field value with ID d09533df-ba99-4475-bfcd-17f43e332e33 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d09533df-ba99-4475-bfcd-17f43e332e33', 'A91B73A2-1616-4B5E-90EA-F769B95081FB', 1, 'audio', 'audio', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 134d3e88-81cd-473a-8412-5d9e5da56c0e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('134d3e88-81cd-473a-8412-5d9e5da56c0e', 'A91B73A2-1616-4B5E-90EA-F769B95081FB', 2, 'image', 'image', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f0999172-8811-4218-9952-a57a41415f99 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f0999172-8811-4218-9952-a57a41415f99', 'A91B73A2-1616-4B5E-90EA-F769B95081FB', 3, 'multimodal', 'multimodal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 32824c79-820a-4f48-8412-224a0cf2edab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32824c79-820a-4f48-8412-224a0cf2edab', 'A91B73A2-1616-4B5E-90EA-F769B95081FB', 4, 'text', 'text', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d7cfc474-9cb4-43ea-9c90-2dd2b4aaa79c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d7cfc474-9cb4-43ea-9c90-2dd2b4aaa79c', 'A91B73A2-1616-4B5E-90EA-F769B95081FB', 5, 'video', 'video', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A91B73A2-1616-4B5E-90EA-F769B95081FB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A91B73A2-1616-4B5E-90EA-F769B95081FB';

/* SQL text to insert entity field value with ID 1c6db017-c6be-49e0-b919-f51bc9ee9f4b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1c6db017-c6be-49e0-b919-f51bc9ee9f4b', '41209810-B679-44C8-82A1-A5A6E5057616', 3, 'MetadataOnly', 'MetadataOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='603BFEB8-11E7-4D60-8C59-47F60AF071D9';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='E34F46AA-1273-4E64-B876-322D1E3FFBD8';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='17027BA3-78F5-43D8-A6F5-5A8CEBB016B2';

/* SQL text to insert entity field value with ID 953cff49-ed68-4d91-807c-82b555ca8c86 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('953cff49-ed68-4d91-807c-82b555ca8c86', 'E21D688F-6C5A-46E9-B4C4-9A132CC4421A', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2e590260-5271-4c2a-9924-965d23c6e328 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2e590260-5271-4c2a-9924-965d23c6e328', 'E21D688F-6C5A-46E9-B4C4-9A132CC4421A', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a0c498e6-70b4-4ae7-8081-79b3201dc1d1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a0c498e6-70b4-4ae7-8081-79b3201dc1d1', 'E21D688F-6C5A-46E9-B4C4-9A132CC4421A', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1717c1ab-bb23-4efa-bf92-edd9d1d672eb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1717c1ab-bb23-4efa-bf92-edd9d1d672eb', 'E21D688F-6C5A-46E9-B4C4-9A132CC4421A', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7504e42a-1c28-4cb2-8b37-400c070dae87 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7504e42a-1c28-4cb2-8b37-400c070dae87', 'E21D688F-6C5A-46E9-B4C4-9A132CC4421A', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E21D688F-6C5A-46E9-B4C4-9A132CC4421A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E21D688F-6C5A-46E9-B4C4-9A132CC4421A';

/* SQL text to insert entity field value with ID 7735ca77-9268-4489-849b-5fed80288330 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7735ca77-9268-4489-849b-5fed80288330', '58345D95-711E-470F-BD28-1AA4AD8214D2', 7, 'Pipeline Stage', 'Pipeline Stage', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d85936a5-3277-40af-b1f4-2e716de50d50 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d85936a5-3277-40af-b1f4-2e716de50d50', '0CC3FE44-493C-44F8-863C-873485695C69', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7b4ee8e1-80de-4fac-bf1d-386e77821308 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7b4ee8e1-80de-4fac-bf1d-386e77821308', '0CC3FE44-493C-44F8-863C-873485695C69', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7f3e7f8d-5e65-426c-961d-f2d4142f95ae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7f3e7f8d-5e65-426c-961d-f2d4142f95ae', '0CC3FE44-493C-44F8-863C-873485695C69', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9f50faaa-d25c-4f19-82b1-73c0272953a6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f50faaa-d25c-4f19-82b1-73c0272953a6', '0CC3FE44-493C-44F8-863C-873485695C69', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 47f45627-04c2-4ea1-807f-3510552cf44a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('47f45627-04c2-4ea1-807f-3510552cf44a', '0CC3FE44-493C-44F8-863C-873485695C69', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0CC3FE44-493C-44F8-863C-873485695C69 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0CC3FE44-493C-44F8-863C-873485695C69';

/* SQL text to insert entity field value with ID c7b1b6b5-4dad-4d8a-aae3-525bdbcee9ed */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c7b1b6b5-4dad-4d8a-aae3-525bdbcee9ed', '62C2E076-B2D0-4130-84C9-C0039758D20E', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fd7eb245-78f0-4c76-96b5-1c15317d5573 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fd7eb245-78f0-4c76-96b5-1c15317d5573', '62C2E076-B2D0-4130-84C9-C0039758D20E', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 743b85ef-978c-4932-b7c2-c40b9b3391c5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('743b85ef-978c-4932-b7c2-c40b9b3391c5', '62C2E076-B2D0-4130-84C9-C0039758D20E', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7b829efe-ac3d-4b6a-9c0d-d5167c8ec222 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7b829efe-ac3d-4b6a-9c0d-d5167c8ec222', '62C2E076-B2D0-4130-84C9-C0039758D20E', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 12485a0a-332a-4a4b-8474-5d35df4a915e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('12485a0a-332a-4a4b-8474-5d35df4a915e', '62C2E076-B2D0-4130-84C9-C0039758D20E', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 62C2E076-B2D0-4130-84C9-C0039758D20E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='62C2E076-B2D0-4130-84C9-C0039758D20E';

/* SQL text to insert entity field value with ID 2e250a9b-a9cc-47ab-b95f-48cf9277df85 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2e250a9b-a9cc-47ab-b95f-48cf9277df85', '9E27AA9C-1112-4324-9956-62096F6B9D5A', 1, 'Deleted', 'Deleted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0f3c30b3-b79c-4ea5-8c4d-ec15f254ca96 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f3c30b3-b79c-4ea5-8c4d-ec15f254ca96', '9E27AA9C-1112-4324-9956-62096F6B9D5A', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9E27AA9C-1112-4324-9956-62096F6B9D5A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9E27AA9C-1112-4324-9956-62096F6B9D5A';


/* Create Entity Relationship: MJ: Files -> MJ: Content Items (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '33485956-f271-4199-b3c9-369c33119e5b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('33485956-f271-4199-b3c9-369c33119e5b', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FileID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;

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

/* SQL text to update entity field related entity name field map for entity field ID 78A87F3B-8A9C-43BE-9B6A-3B4F6BB83E6A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='78A87F3B-8A9C-43BE-9B6A-3B4F6BB83E6A', @RelatedEntityNameFieldMap='File';

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
    @DiscoveryStatus_Clear bit = 0,
    @DiscoveryStatus nvarchar(40) = NULL
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
                [DiscoveryStatus]
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
                CASE WHEN @DiscoveryStatus_Clear = 1 THEN NULL ELSE ISNULL(@DiscoveryStatus, NULL) END
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
                [DiscoveryStatus]
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
                CASE WHEN @DiscoveryStatus_Clear = 1 THEN NULL ELSE ISNULL(@DiscoveryStatus, NULL) END
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
    @DiscoveryStatus_Clear bit = 0,
    @DiscoveryStatus nvarchar(40) = NULL
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
        [DiscoveryStatus] = CASE WHEN @DiscoveryStatus_Clear = 1 THEN NULL ELSE ISNULL(@DiscoveryStatus, [DiscoveryStatus]) END
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
    DECLARE @MJContentSources_EntityDocumentID_DiscoveryStatus nvarchar(40)
    DECLARE cascade_update_MJContentSources_EntityDocumentID_cursor CURSOR FOR
        SELECT [ID], [Name], [ContentTypeID], [ContentSourceTypeID], [ContentFileTypeID], [URL], [EmbeddingModelID], [VectorIndexID], [Configuration], [EntityID], [EntityDocumentID], [SegmenterKey], [CleanerKey], [ScheduledJobID], [FieldConfidence], [DiscoveryStatus]
        FROM [${flyway:defaultSchema}].[ContentSource]
        WHERE [EntityDocumentID] = @ID

    OPEN cascade_update_MJContentSources_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID, @MJContentSources_EntityDocumentID_FieldConfidence, @MJContentSources_EntityDocumentID_DiscoveryStatus

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJContentSources_EntityDocumentID_EntityDocumentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateContentSource] @ID = @MJContentSources_EntityDocumentIDID, @Name = @MJContentSources_EntityDocumentID_Name, @ContentTypeID = @MJContentSources_EntityDocumentID_ContentTypeID, @ContentSourceTypeID = @MJContentSources_EntityDocumentID_ContentSourceTypeID, @ContentFileTypeID = @MJContentSources_EntityDocumentID_ContentFileTypeID, @URL = @MJContentSources_EntityDocumentID_URL, @EmbeddingModelID = @MJContentSources_EntityDocumentID_EmbeddingModelID, @VectorIndexID = @MJContentSources_EntityDocumentID_VectorIndexID, @Configuration = @MJContentSources_EntityDocumentID_Configuration, @EntityID = @MJContentSources_EntityDocumentID_EntityID, @EntityDocumentID_Clear = 1, @EntityDocumentID = @MJContentSources_EntityDocumentID_EntityDocumentID, @SegmenterKey = @MJContentSources_EntityDocumentID_SegmenterKey, @CleanerKey = @MJContentSources_EntityDocumentID_CleanerKey, @ScheduledJobID = @MJContentSources_EntityDocumentID_ScheduledJobID, @FieldConfidence = @MJContentSources_EntityDocumentID_FieldConfidence, @DiscoveryStatus = @MJContentSources_EntityDocumentID_DiscoveryStatus

        FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID, @MJContentSources_EntityDocumentID_FieldConfidence, @MJContentSources_EntityDocumentID_DiscoveryStatus
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4300783e-78aa-47d0-a9ab-622a9f1cc203' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'File')) BEGIN
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
            '4300783e-78aa-47d0-a9ab-622a9f1cc203',
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
               WHERE ID = '0CC3FE44-493C-44F8-863C-873485695C69'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D4681ECA-9242-44AF-9C8C-3F1D80E451D0'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E21D688F-6C5A-46E9-B4C4-9A132CC4421A'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FA690241-EF35-4446-B7A1-893DEF4E9E38';

-- UPDATE Entity Field Category Info MJ: Content Sources.DiscoveryStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E21D688F-6C5A-46E9-B4C4-9A132CC4421A';

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '61FFCC16-9494-4A39-9663-A0850C60624E';

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Decorator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Content',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '409E836D-258B-40C4-85A0-3A54304830D7';

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

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Content Items.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '585B13C9-FADC-4707-93EC-FF4CAD9B0F42';

-- UPDATE Entity Field Category Info MJ: Content Items.ExtractionStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0CC3FE44-493C-44F8-863C-873485695C69';

-- UPDATE Entity Field Category Info MJ: Content Items.SegmentationStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '62C2E076-B2D0-4130-84C9-C0039758D20E';

-- UPDATE Entity Field Category Info MJ: Content Items.DeleteStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9E27AA9C-1112-4324-9956-62096F6B9D5A';

-- UPDATE Entity Field Category Info MJ: Content Items.Modality 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A91B73A2-1616-4B5E-90EA-F769B95081FB';

-- UPDATE Entity Field Category Info MJ: Content Items.Date 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Date'
WHERE 
   ID = 'D4681ECA-9242-44AF-9C8C-3F1D80E451D0';

-- UPDATE Entity Field Category Info MJ: Content Items.Decorator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4D33320C-92D2-44DD-8D38-C21B0435384F';

-- UPDATE Entity Field Category Info MJ: Content Items.FileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'File'
WHERE 
   ID = '78A87F3B-8A9C-43BE-9B6A-3B4F6BB83E6A';

-- UPDATE Entity Field Category Info MJ: Content Items.File 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'File Reference'
WHERE 
   ID = '4300783E-78AA-47D0-A9AB-622A9F1CC203';

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

