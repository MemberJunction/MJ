/*
  Content Pipeline Framework — phase F0 schema.

  Adds the working-record substrate the content pipeline stages are built on:
    * FieldConfidence   — per-field provenance/confidence JSON on the three pipeline entities
    * stage statuses    — DiscoveryStatus on Content Source, and ExtractionStatus /
                          SegmentationStatus on Content Item alongside the existing
                          TaggingStatus / EmbeddingStatus
    * DeleteStatus      — soft-delete marker on Content Item, mirroring Content Item Chunk
    * extractor cascade — ExtractorKey on Content Source / Content Type (defaults) and on
                          Content Item (what actually ran), plus ExtractorKeyOverride (forced)
    * multi-modal       — Modality on Content Item, flags on Content Source / Content Source Type,
                          FileID for durable copies of fetched artifacts
    * well-known fields — Date and Decorator on Content Item, Decorator on Content Item Chunk,
                          completing the fixed set a
                          working record maps onto real columns (Text, FileType, ContentType,
                          Title, Date, Modality, Decorator)
    * 'Pipeline Stage'  — a new Record Process WorkType
    * 'MetadataOnly'    — a new Content Item EmbeddingStatus value (metadata-only re-embed)

  Every change is additive. Naming follows the conventions already in these tables:
  SegmenterKey / CleanerKey establish the nvarchar(100) "registered class key" pattern, and the
  status columns on Content Item are nvarchar(40) over a five-value list.
*/

-- ---------------------------------------------------------------------------
-- Content Item
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentItem ADD
    FieldConfidence NVARCHAR(MAX) NULL,
    ExtractionStatus NVARCHAR(40) NOT NULL CONSTRAINT DF_ContentItem_ExtractionStatus DEFAULT ('Pending'),
    SegmentationStatus NVARCHAR(40) NOT NULL CONSTRAINT DF_ContentItem_SegmentationStatus DEFAULT ('Pending'),
    DeleteStatus NVARCHAR(20) NULL,
    ExtractorKey NVARCHAR(100) NULL,
    ExtractorKeyOverride NVARCHAR(100) NULL,
    Modality NVARCHAR(20) NOT NULL CONSTRAINT DF_ContentItem_Modality DEFAULT ('text'),
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
    ExtractorKey NVARCHAR(100) NULL,
    MultiModalEnabled BIT NOT NULL CONSTRAINT DF_ContentSource_MultiModalEnabled DEFAULT (0),
    DiscoveryStatus NVARCHAR(40) NOT NULL CONSTRAINT DF_ContentSource_DiscoveryStatus DEFAULT ('Pending'),
    LastDiscoveredAt DATETIMEOFFSET NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentSource
    ADD CONSTRAINT CK_ContentSource_DiscoveryStatus
    CHECK (DiscoveryStatus IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped'));
GO


-- ---------------------------------------------------------------------------
-- Content Type
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentType ADD
    ExtractorKey NVARCHAR(100) NULL;
GO

-- ---------------------------------------------------------------------------
-- Content Source Type
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.ContentSourceType ADD
    SupportsMultiModal BIT NOT NULL CONSTRAINT DF_ContentSourceType_SupportsMultiModal DEFAULT (0);
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
    @value = N'Status of the Discover stage for this source: Pending, Processing, Complete, Failed or Skipped. What makes a source ready to walk is its schedule; this records how the last walk ended.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'DiscoveryStatus';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When this source was last walked by the Discover stage.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'LastDiscoveredAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Text that accompanies this chunk so it still makes sense retrieved on its own — normally inherited from its parent item. Kept as its own field rather than prefixed into Text so it stays separately searchable and can be revised without rewriting the chunk.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItemChunk',
    @level2type = N'COLUMN', @level2name = 'Decorator';
























































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
***  Generated: 2026-10-02 by @memberjunction/cli 6.2.0-edge.1
***
******************************************************************************************
*****************************************************************************************/

/* SQL text to insert 19 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d79792e-03f2-4d6c-8413-ab7985a71b00' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldConfidence')) BEGIN
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
            '4d79792e-03f2-4d6c-8413-ab7985a71b00',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'FieldConfidence',
            'Field Confidence',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53584129-52f2-4d9d-b1a6-85bfdbfc231c' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKey')) BEGIN
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
            '53584129-52f2-4d9d-b1a6-85bfdbfc231c',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKey',
            'Extractor Key',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb0d4146-bcb2-49e5-bd08-9340706ea53b' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'MultiModalEnabled')) BEGIN
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
            'eb0d4146-bcb2-49e5-bd08-9340706ea53b',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'MultiModalEnabled',
            'Multi Modal Enabled',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd718a3df-3760-4ef9-9521-7a79edcef6b0' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'DiscoveryStatus')) BEGIN
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
            'd718a3df-3760-4ef9-9521-7a79edcef6b0',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'DiscoveryStatus',
            'Discovery Status',
            'Status of the Discover stage for this source: Pending, Processing, Complete, Failed or Skipped. What makes a source ready to walk is its schedule; this records how the last walk ended.',
            'nvarchar',
            80,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a1750d7e-1153-459e-aa15-6557beec89d3' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastDiscoveredAt')) BEGIN
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
            'a1750d7e-1153-459e-aa15-6557beec89d3',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96935dde-419a-4e67-979e-c3e578a58213' OR (EntityID = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'SupportsMultiModal')) BEGIN
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
            '96935dde-419a-4e67-979e-c3e578a58213',
            'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Source Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22'),
            'SupportsMultiModal',
            'Supports Multi Modal',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75b916f9-936e-4b7d-9dd8-5b3b038d5f3f' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKey')) BEGIN
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
            '75b916f9-936e-4b7d-9dd8-5b3b038d5f3f',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKey',
            'Extractor Key',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84b08344-b6a8-4b12-89bb-3142d199451e' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldConfidence')) BEGIN
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
            '84b08344-b6a8-4b12-89bb-3142d199451e',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'FieldConfidence',
            'Field Confidence',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bae40000-6496-4bca-aae4-4002d0569536' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractionStatus')) BEGIN
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
            'bae40000-6496-4bca-aae4-4002d0569536',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractionStatus',
            'Extraction Status',
            NULL,
            'nvarchar',
            80,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d5f0ff3-5e9e-45b0-b806-212317951e7a' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'SegmentationStatus')) BEGIN
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
            '5d5f0ff3-5e9e-45b0-b806-212317951e7a',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'SegmentationStatus',
            'Segmentation Status',
            NULL,
            'nvarchar',
            80,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2846295a-5a6c-4f5d-9b16-cf16762f265b' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'DeleteStatus')) BEGIN
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
            '2846295a-5a6c-4f5d-9b16-cf16762f265b',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'DeleteStatus',
            'Delete Status',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c16aacd0-0436-4e9e-ae02-a72e75ab4aa4' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKey')) BEGIN
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
            'c16aacd0-0436-4e9e-ae02-a72e75ab4aa4',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKey',
            'Extractor Key',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d4454ea-7879-40b3-960c-7678cab835c7' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ExtractorKeyOverride')) BEGIN
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
            '7d4454ea-7879-40b3-960c-7678cab835c7',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'ExtractorKeyOverride',
            'Extractor Key Override',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b2f6bc3-983d-4abe-b98e-c6deff926716' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Modality')) BEGIN
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
            '9b2f6bc3-983d-4abe-b98e-c6deff926716',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'Modality',
            'Modality',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            'text',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd87fac96-8e4c-415a-84a7-8378a5d38748' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Date')) BEGIN
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
            'd87fac96-8e4c-415a-84a7-8378a5d38748',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'Date',
            'Date',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5aa7f807-a3e2-4582-a0db-25a789faa4f3' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Decorator')) BEGIN
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
            '5aa7f807-a3e2-4582-a0db-25a789faa4f3',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'Decorator',
            'Decorator',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1857d613-85c3-4357-87b5-78659d940b10' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FileID')) BEGIN
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
            '1857d613-85c3-4357-87b5-78659d940b10',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22'),
            'FileID',
            'File ID',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '462e6b74-3b9d-47a6-8a15-76930d37c634' OR (EntityID = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND Name = 'FieldConfidence')) BEGIN
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
            '462e6b74-3b9d-47a6-8a15-76930d37c634',
            '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21', -- Entity: MJ: Content Item Chunks
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'),
            'FieldConfidence',
            'Field Confidence',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72368b32-8b0a-47a5-82b5-683b287287a0' OR (EntityID = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND Name = 'Decorator')) BEGIN
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
            '72368b32-8b0a-47a5-82b5-683b287287a0',
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

/* SQL text to insert entity field value with ID 9bb32a14-1026-4dcd-a2df-5dd5e6af9ace */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9bb32a14-1026-4dcd-a2df-5dd5e6af9ace', 'BAE40000-6496-4BCA-AAE4-4002D0569536', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 335c35e0-183d-4c7b-8d09-de97861357be */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('335c35e0-183d-4c7b-8d09-de97861357be', 'BAE40000-6496-4BCA-AAE4-4002D0569536', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7e6d7adb-0c49-41e3-b26b-42acf6834984 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7e6d7adb-0c49-41e3-b26b-42acf6834984', 'BAE40000-6496-4BCA-AAE4-4002D0569536', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 56840cf5-0bed-4dc0-b0f6-183fedcf86c5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('56840cf5-0bed-4dc0-b0f6-183fedcf86c5', 'BAE40000-6496-4BCA-AAE4-4002D0569536', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID edee9536-d5f7-45d8-a122-7ced049acea7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('edee9536-d5f7-45d8-a122-7ced049acea7', 'BAE40000-6496-4BCA-AAE4-4002D0569536', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BAE40000-6496-4BCA-AAE4-4002D0569536 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BAE40000-6496-4BCA-AAE4-4002D0569536';

/* SQL text to insert entity field value with ID 38b98e03-be55-4fd8-82f7-e5f16d371dbb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('38b98e03-be55-4fd8-82f7-e5f16d371dbb', '5D5F0FF3-5E9E-45B0-B806-212317951E7A', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7dfa972b-ba05-4f79-b18e-62c94c9f0f67 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7dfa972b-ba05-4f79-b18e-62c94c9f0f67', '5D5F0FF3-5E9E-45B0-B806-212317951E7A', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 75931442-0d76-4ec0-a35d-b141f180ca2e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('75931442-0d76-4ec0-a35d-b141f180ca2e', '5D5F0FF3-5E9E-45B0-B806-212317951E7A', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6f5e1845-034c-46be-8c0d-f9e602404d3b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6f5e1845-034c-46be-8c0d-f9e602404d3b', '5D5F0FF3-5E9E-45B0-B806-212317951E7A', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b41a7e77-c8d5-462d-9715-0cb4392a4802 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b41a7e77-c8d5-462d-9715-0cb4392a4802', '5D5F0FF3-5E9E-45B0-B806-212317951E7A', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5D5F0FF3-5E9E-45B0-B806-212317951E7A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5D5F0FF3-5E9E-45B0-B806-212317951E7A';

/* SQL text to insert entity field value with ID ed8c0629-50c0-4363-94fe-872e979eaf00 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed8c0629-50c0-4363-94fe-872e979eaf00', '2846295A-5A6C-4F5D-9B16-CF16762F265B', 1, 'Deleted', 'Deleted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b994f40c-911d-4c51-acd0-86115ce8a9a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b994f40c-911d-4c51-acd0-86115ce8a9a9', '2846295A-5A6C-4F5D-9B16-CF16762F265B', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2846295A-5A6C-4F5D-9B16-CF16762F265B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2846295A-5A6C-4F5D-9B16-CF16762F265B';

/* SQL text to insert entity field value with ID 65ae638a-0809-407f-a90c-f144a0df2412 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('65ae638a-0809-407f-a90c-f144a0df2412', '9B2F6BC3-983D-4ABE-B98E-C6DEFF926716', 1, 'audio', 'audio', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a1aab961-c3a3-4fd7-868d-275d138cdc63 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a1aab961-c3a3-4fd7-868d-275d138cdc63', '9B2F6BC3-983D-4ABE-B98E-C6DEFF926716', 2, 'image', 'image', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 32c7fd56-eb6e-4d8e-8c2a-4cf8a1871aa7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('32c7fd56-eb6e-4d8e-8c2a-4cf8a1871aa7', '9B2F6BC3-983D-4ABE-B98E-C6DEFF926716', 3, 'multimodal', 'multimodal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d5c95035-aa68-4c50-abed-d34f42e72827 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d5c95035-aa68-4c50-abed-d34f42e72827', '9B2F6BC3-983D-4ABE-B98E-C6DEFF926716', 4, 'text', 'text', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ab1d4dcf-909f-460d-983f-52ce642ae4e8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ab1d4dcf-909f-460d-983f-52ce642ae4e8', '9B2F6BC3-983D-4ABE-B98E-C6DEFF926716', 5, 'video', 'video', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 9B2F6BC3-983D-4ABE-B98E-C6DEFF926716 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='9B2F6BC3-983D-4ABE-B98E-C6DEFF926716';

/* SQL text to insert entity field value with ID 7a9043a6-968d-4c1a-b2fd-7a885562c637 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7a9043a6-968d-4c1a-b2fd-7a885562c637', '41209810-B679-44C8-82A1-A5A6E5057616', 3, 'MetadataOnly', 'MetadataOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='603BFEB8-11E7-4D60-8C59-47F60AF071D9';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='E34F46AA-1273-4E64-B876-322D1E3FFBD8';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='17027BA3-78F5-43D8-A6F5-5A8CEBB016B2';

/* SQL text to insert entity field value with ID ef486fa3-e8a3-4bb6-8161-8493867565b8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef486fa3-e8a3-4bb6-8161-8493867565b8', 'D718A3DF-3760-4EF9-9521-7A79EDCEF6B0', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3b5ef088-75d1-4498-afd2-d2a41043260b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3b5ef088-75d1-4498-afd2-d2a41043260b', 'D718A3DF-3760-4EF9-9521-7A79EDCEF6B0', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3985640f-9630-440d-b4fd-36be56f2037f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3985640f-9630-440d-b4fd-36be56f2037f', 'D718A3DF-3760-4EF9-9521-7A79EDCEF6B0', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58906c2b-d0f4-4903-9267-4abaf1ab5524 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58906c2b-d0f4-4903-9267-4abaf1ab5524', 'D718A3DF-3760-4EF9-9521-7A79EDCEF6B0', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d70be9fc-f309-41aa-8b71-fe4d63ff1ba5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d70be9fc-f309-41aa-8b71-fe4d63ff1ba5', 'D718A3DF-3760-4EF9-9521-7A79EDCEF6B0', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D718A3DF-3760-4EF9-9521-7A79EDCEF6B0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D718A3DF-3760-4EF9-9521-7A79EDCEF6B0';

/* SQL text to insert entity field value with ID 7c8e2ff6-4c14-4c65-849e-c6566d6b3106 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7c8e2ff6-4c14-4c65-849e-c6566d6b3106', '58345D95-711E-470F-BD28-1AA4AD8214D2', 7, 'Pipeline Stage', 'Pipeline Stage', GETUTCDATE(), GETUTCDATE());

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Files -> MJ: Content Items (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '779dd08e-97a9-4ba8-a601-6f7de18dc2a0'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('779dd08e-97a9-4ba8-a601-6f7de18dc2a0', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FileID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 1857D613-85C3-4357-87B5-78659D940B10 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1857D613-85C3-4357-87B5-78659D940B10', @RelatedEntityNameFieldMap='File';

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
    @ExtractionStatus nvarchar(40) = NULL,
    @SegmentationStatus nvarchar(40) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL,
    @ExtractorKeyOverride_Clear bit = 0,
    @ExtractorKeyOverride nvarchar(100) = NULL,
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
                ISNULL(@ExtractionStatus, 'Pending'),
                ISNULL(@SegmentationStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END,
                CASE WHEN @ExtractorKeyOverride_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKeyOverride, NULL) END,
                ISNULL(@Modality, 'text'),
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
                ISNULL(@ExtractionStatus, 'Pending'),
                ISNULL(@SegmentationStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END,
                CASE WHEN @ExtractorKeyOverride_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKeyOverride, NULL) END,
                ISNULL(@Modality, 'text'),
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
    @ExtractionStatus nvarchar(40) = NULL,
    @SegmentationStatus nvarchar(40) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL,
    @ExtractorKeyOverride_Clear bit = 0,
    @ExtractorKeyOverride nvarchar(100) = NULL,
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
        [ExtractionStatus] = ISNULL(@ExtractionStatus, [ExtractionStatus]),
        [SegmentationStatus] = ISNULL(@SegmentationStatus, [SegmentationStatus]),
        [DeleteStatus] = CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, [DeleteStatus]) END,
        [ExtractorKey] = CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, [ExtractorKey]) END,
        [ExtractorKeyOverride] = CASE WHEN @ExtractorKeyOverride_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKeyOverride, [ExtractorKeyOverride]) END,
        [Modality] = ISNULL(@Modality, [Modality]),
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

/* Index for Foreign Keys for ContentSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

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

/* Base View SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: vwContentSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Source Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentSourceTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentSourceTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSourceTypes]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[ContentSourceType] AS c
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Permissions for vwContentSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spCreateContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSourceType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @SupportsMultiModal bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentSourceType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [SupportsMultiModal]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@SupportsMultiModal, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentSourceType]
            (
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [SupportsMultiModal]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@SupportsMultiModal, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Source Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spUpdateContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @SupportsMultiModal bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [SupportsMultiModal] = ISNULL(@SupportsMultiModal, [SupportsMultiModal])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentSourceTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSourceTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSourceType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentSourceType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentSourceType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSourceType
ON [${flyway:defaultSchema}].[ContentSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSourceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Source Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] TO [cdp_Developer], [cdp_Integration];

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
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL,
    @MultiModalEnabled bit = NULL,
    @DiscoveryStatus nvarchar(40) = NULL,
    @LastDiscoveredAt_Clear bit = 0,
    @LastDiscoveredAt datetimeoffset = NULL
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
                [ExtractorKey],
                [MultiModalEnabled],
                [DiscoveryStatus],
                [LastDiscoveredAt]
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
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END,
                ISNULL(@MultiModalEnabled, 0),
                ISNULL(@DiscoveryStatus, 'Pending'),
                CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, NULL) END
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
                [ExtractorKey],
                [MultiModalEnabled],
                [DiscoveryStatus],
                [LastDiscoveredAt]
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
                CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, NULL) END,
                ISNULL(@MultiModalEnabled, 0),
                ISNULL(@DiscoveryStatus, 'Pending'),
                CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, NULL) END
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
    @ExtractorKey_Clear bit = 0,
    @ExtractorKey nvarchar(100) = NULL,
    @MultiModalEnabled bit = NULL,
    @DiscoveryStatus nvarchar(40) = NULL,
    @LastDiscoveredAt_Clear bit = 0,
    @LastDiscoveredAt datetimeoffset = NULL
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
        [ExtractorKey] = CASE WHEN @ExtractorKey_Clear = 1 THEN NULL ELSE ISNULL(@ExtractorKey, [ExtractorKey]) END,
        [MultiModalEnabled] = ISNULL(@MultiModalEnabled, [MultiModalEnabled]),
        [DiscoveryStatus] = ISNULL(@DiscoveryStatus, [DiscoveryStatus]),
        [LastDiscoveredAt] = CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, [LastDiscoveredAt]) END
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

/* spDelete SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: spDeleteContentSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSourceType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSourceType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Source Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] TO [cdp_Developer], [cdp_Integration];

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
    DECLARE @MJContentSources_EntityDocumentID_ExtractorKey nvarchar(100)
    DECLARE @MJContentSources_EntityDocumentID_MultiModalEnabled bit
    DECLARE @MJContentSources_EntityDocumentID_DiscoveryStatus nvarchar(40)
    DECLARE @MJContentSources_EntityDocumentID_LastDiscoveredAt datetimeoffset
    DECLARE cascade_update_MJContentSources_EntityDocumentID_cursor CURSOR FOR
        SELECT [ID], [Name], [ContentTypeID], [ContentSourceTypeID], [ContentFileTypeID], [URL], [EmbeddingModelID], [VectorIndexID], [Configuration], [EntityID], [EntityDocumentID], [SegmenterKey], [CleanerKey], [ScheduledJobID], [FieldConfidence], [ExtractorKey], [MultiModalEnabled], [DiscoveryStatus], [LastDiscoveredAt]
        FROM [${flyway:defaultSchema}].[ContentSource]
        WHERE [EntityDocumentID] = @ID

    OPEN cascade_update_MJContentSources_EntityDocumentID_cursor
    FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID, @MJContentSources_EntityDocumentID_FieldConfidence, @MJContentSources_EntityDocumentID_ExtractorKey, @MJContentSources_EntityDocumentID_MultiModalEnabled, @MJContentSources_EntityDocumentID_DiscoveryStatus, @MJContentSources_EntityDocumentID_LastDiscoveredAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJContentSources_EntityDocumentID_EntityDocumentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateContentSource] @ID = @MJContentSources_EntityDocumentIDID, @Name = @MJContentSources_EntityDocumentID_Name, @ContentTypeID = @MJContentSources_EntityDocumentID_ContentTypeID, @ContentSourceTypeID = @MJContentSources_EntityDocumentID_ContentSourceTypeID, @ContentFileTypeID = @MJContentSources_EntityDocumentID_ContentFileTypeID, @URL = @MJContentSources_EntityDocumentID_URL, @EmbeddingModelID = @MJContentSources_EntityDocumentID_EmbeddingModelID, @VectorIndexID = @MJContentSources_EntityDocumentID_VectorIndexID, @Configuration = @MJContentSources_EntityDocumentID_Configuration, @EntityID = @MJContentSources_EntityDocumentID_EntityID, @EntityDocumentID_Clear = 1, @EntityDocumentID = @MJContentSources_EntityDocumentID_EntityDocumentID, @SegmenterKey = @MJContentSources_EntityDocumentID_SegmenterKey, @CleanerKey = @MJContentSources_EntityDocumentID_CleanerKey, @ScheduledJobID = @MJContentSources_EntityDocumentID_ScheduledJobID, @FieldConfidence = @MJContentSources_EntityDocumentID_FieldConfidence, @ExtractorKey = @MJContentSources_EntityDocumentID_ExtractorKey, @MultiModalEnabled = @MJContentSources_EntityDocumentID_MultiModalEnabled, @DiscoveryStatus = @MJContentSources_EntityDocumentID_DiscoveryStatus, @LastDiscoveredAt = @MJContentSources_EntityDocumentID_LastDiscoveredAt

        FETCH NEXT FROM cascade_update_MJContentSources_EntityDocumentID_cursor INTO @MJContentSources_EntityDocumentIDID, @MJContentSources_EntityDocumentID_Name, @MJContentSources_EntityDocumentID_ContentTypeID, @MJContentSources_EntityDocumentID_ContentSourceTypeID, @MJContentSources_EntityDocumentID_ContentFileTypeID, @MJContentSources_EntityDocumentID_URL, @MJContentSources_EntityDocumentID_EmbeddingModelID, @MJContentSources_EntityDocumentID_VectorIndexID, @MJContentSources_EntityDocumentID_Configuration, @MJContentSources_EntityDocumentID_EntityID, @MJContentSources_EntityDocumentID_EntityDocumentID, @MJContentSources_EntityDocumentID_SegmenterKey, @MJContentSources_EntityDocumentID_CleanerKey, @MJContentSources_EntityDocumentID_ScheduledJobID, @MJContentSources_EntityDocumentID_FieldConfidence, @MJContentSources_EntityDocumentID_ExtractorKey, @MJContentSources_EntityDocumentID_MultiModalEnabled, @MJContentSources_EntityDocumentID_DiscoveryStatus, @MJContentSources_EntityDocumentID_LastDiscoveredAt
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '046a50ba-8901-4dfd-9675-7dd6989088f6' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'File')) BEGIN
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
            '046a50ba-8901-4dfd-9675-7dd6989088f6',
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
               WHERE ID = 'D718A3DF-3760-4EF9-9521-7A79EDCEF6B0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A1750D7E-1153-459E-AA15-6557BEEC89D3'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '96935DDE-419A-4E67-979E-C3E578A58213'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BAE40000-6496-4BCA-AAE4-4002D0569536'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: Content Types.ExtractorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '75B916F9-936E-4B7D-9DD8-5B3B038D5F3F';

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ: Content Source Types.SupportsMultiModal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Supports Multi-Modal'
WHERE 
   ID = '96935DDE-419A-4E67-979E-C3E578A58213';

/* Set categories for 5 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4D79792E-03F2-4D6C-8413-AB7985A71B00';

-- UPDATE Entity Field Category Info MJ: Content Sources.ExtractorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Extractor Strategy'
WHERE 
   ID = '53584129-52F2-4D9D-B1A6-85BFDBFC231C';

-- UPDATE Entity Field Category Info MJ: Content Sources.MultiModalEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Indexing',
   GeneratedFormSection = 'Category',
   DisplayName = 'Multi-Modal Enabled'
WHERE 
   ID = 'EB0D4146-BCB2-49E5-BD08-9340706EA53B';

-- UPDATE Entity Field Category Info MJ: Content Sources.DiscoveryStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D718A3DF-3760-4EF9-9521-7A79EDCEF6B0';

-- UPDATE Entity Field Category Info MJ: Content Sources.LastDiscoveredAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A1750D7E-1153-459E-AA15-6557BEEC89D3';

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '462E6B74-3B9D-47A6-8A15-76930D37C634';

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Decorator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Content',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Markdown'
WHERE 
   ID = '72368B32-8B0A-47A5-82B5-683B287287A0';

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

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Content Items.FieldConfidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '84B08344-B6A8-4B12-89BB-3142D199451E';

-- UPDATE Entity Field Category Info MJ: Content Items.ExtractionStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BAE40000-6496-4BCA-AAE4-4002D0569536';

-- UPDATE Entity Field Category Info MJ: Content Items.SegmentationStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5D5F0FF3-5E9E-45B0-B806-212317951E7A';

-- UPDATE Entity Field Category Info MJ: Content Items.DeleteStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2846295A-5A6C-4F5D-9B16-CF16762F265B';

-- UPDATE Entity Field Category Info MJ: Content Items.ExtractorKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C16AACD0-0436-4E9E-AE02-A72E75AB4AA4';

-- UPDATE Entity Field Category Info MJ: Content Items.ExtractorKeyOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7D4454EA-7879-40B3-960C-7678CAB835C7';

-- UPDATE Entity Field Category Info MJ: Content Items.Modality 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9B2F6BC3-983D-4ABE-B98E-C6DEFF926716';

-- UPDATE Entity Field Category Info MJ: Content Items.Date 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Date'
WHERE 
   ID = 'D87FAC96-8E4C-415A-84A7-8378A5D38748';

-- UPDATE Entity Field Category Info MJ: Content Items.Decorator 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5AA7F807-A3E2-4582-A0DB-25A789FAA4F3';

-- UPDATE Entity Field Category Info MJ: Content Items.FileID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'File'
WHERE 
   ID = '1857D613-85C3-4357-87B5-78659D940B10';

-- UPDATE Entity Field Category Info MJ: Content Items.File 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'File Reference'
WHERE 
   ID = '046A50BA-8901-4DFD-9675-7DD6989088F6';

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

/* Update FieldCategoryInfo setting for entity */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Processing Status": {
    "description": "Tracks the lifecycle and state of automated content processing tasks",
    "icon": "fa fa-tasks"
  }
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

                  UPDATE [${flyway:defaultSchema}].[EntitySetting]
                  SET [Value] = '{
  "Processing Status": "fa fa-tasks"
}', [__mj_UpdatedAt] = GETUTCDATE()
                  WHERE [EntityID] = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND [Name] = 'FieldCategoryIcons';

