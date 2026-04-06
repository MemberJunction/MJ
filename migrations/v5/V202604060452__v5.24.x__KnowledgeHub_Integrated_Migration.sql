-- Autotagging Taxonomy Bridge: Schema changes for plugin architecture, entity-source rebuild,
-- tag taxonomy bridge, and tagged item weights.
--
-- Changes:
--   ContentSourceType: +DriverClass, +Configuration
--   ContentSource:     +Configuration, +EntityID (FK Entity), +EntityDocumentID (FK EntityDocument)
--   ContentType:       +Configuration
--   ContentItem:       +EntityRecordDocumentID (FK EntityRecordDocument)
--   ContentItemTag:    +TagID (FK Tag)
--   TaggedItem:        +Weight
--

----------------------------------------------------------------------
-- 1. DDL: ALTER TABLE statements
----------------------------------------------------------------------

-- ContentSourceType: add DriverClass and Configuration
ALTER TABLE ${flyway:defaultSchema}.ContentSourceType
    ADD DriverClass NVARCHAR(255) NULL,
        Configuration NVARCHAR(MAX) NULL;
GO

-- ContentSource: add Configuration, EntityID, EntityDocumentID
ALTER TABLE ${flyway:defaultSchema}.ContentSource
    ADD Configuration NVARCHAR(MAX) NULL,
        EntityID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentSource_Entity FOREIGN KEY REFERENCES ${flyway:defaultSchema}.Entity(ID),
        EntityDocumentID UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_ContentSource_EntityDocument FOREIGN KEY REFERENCES ${flyway:defaultSchema}.EntityDocument(ID);
GO

-- ContentType: add Configuration
ALTER TABLE ${flyway:defaultSchema}.ContentType
    ADD Configuration NVARCHAR(MAX) NULL;
GO

-- ContentItem: add EntityRecordDocumentID
ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD EntityRecordDocumentID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ContentItem_EntityRecordDocument FOREIGN KEY REFERENCES ${flyway:defaultSchema}.EntityRecordDocument(ID);
GO

-- ContentItemTag: add TagID
ALTER TABLE ${flyway:defaultSchema}.ContentItemTag
    ADD TagID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ContentItemTag_Tag FOREIGN KEY REFERENCES ${flyway:defaultSchema}.Tag(ID);
GO

-- TaggedItem: add Weight
ALTER TABLE ${flyway:defaultSchema}.TaggedItem
    ADD Weight NUMERIC(5, 4) NOT NULL CONSTRAINT DF_TaggedItem_Weight DEFAULT 1.0;
GO



----------------------------------------------------------------------
-- 2. Extended Properties
----------------------------------------------------------------------

-- ContentSourceType.DriverClass
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The registered class name used by ClassFactory to instantiate the provider for this source type (e.g., AutotagLocalFileSystem, AutotagEntity). Must match a @RegisterClass key on a class extending AutotagBase.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSourceType',
    @level2type = N'COLUMN', @level2name = 'DriverClass';

-- ContentSourceType.Configuration
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration blob for type-level settings. Conforms to the IContentSourceTypeConfiguration interface. Reserved for future type-wide settings shared by all sources of this type.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSourceType',
    @level2type = N'COLUMN', @level2name = 'Configuration';

-- ContentSource.Configuration
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration blob for source-instance settings. Conforms to the IContentSourceConfiguration interface. Includes tag taxonomy mode (constrained/auto-grow/free-flow), tag root ID, match threshold, LLM taxonomy sharing, and vectorization toggle.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'Configuration';

-- ContentSource.EntityID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For Entity-type content sources, the MJ Entity to pull records from. NULL for non-entity sources (files, RSS, websites, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'EntityID';

-- ContentSource.EntityDocumentID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For Entity-type content sources, the Entity Document template used to render entity records into text for autotagging. The template defines which fields to include, how to format them, and related record inclusion. NULL for non-entity sources.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentSource',
    @level2type = N'COLUMN', @level2name = 'EntityDocumentID';

-- ContentType.Configuration
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration blob for content-type-level settings. Conforms to the IContentTypeConfiguration interface. Reserved for future type-wide settings such as default tag taxonomy rules and processing options.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentType',
    @level2type = N'COLUMN', @level2name = 'Configuration';

-- ContentItem.EntityRecordDocumentID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For entity-sourced content items, links to the Entity Record Document snapshot that was rendered for this item. Provides traceability back to the source entity record via ERD.EntityID + ERD.RecordID. NULL for non-entity sources.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItem',
    @level2type = N'COLUMN', @level2name = 'EntityRecordDocumentID';

-- ContentItemTag.TagID
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the formal MJ Tag taxonomy. When set, this free-text tag has been matched (via semantic similarity or exact match) to a curated Tag record. NULL means the tag is unmatched free text only.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ContentItemTag',
    @level2type = N'COLUMN', @level2name = 'TagID';

-- TaggedItem.Weight
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Relevance weight of this tag association (0.0 to 1.0). 1.0 indicates the tag is highly relevant or was manually applied. Lower values indicate decreasing relevance as determined by LLM autotagging. Default 1.0 for manually applied tags.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'TaggedItem',
    @level2type = N'COLUMN', @level2name = 'Weight';



































-- Large-Scale Processing Infrastructure
--
-- 1. Extend ContentProcessRun with resume/progress/cancellation columns
-- 2. Add ContentProcessRunDetail for per-source tracking within a run
-- 3. Add ContentProcessRunPromptRun junction table linking to AIPromptRun
-- 4. Extend DuplicateRun with progress/resume columns
-- 5. Extend DuplicateRunDetail with start/end timestamps
--

----------------------------------------------------------------------
-- 1. ContentProcessRun extensions
----------------------------------------------------------------------

ALTER TABLE ${flyway:defaultSchema}.ContentProcessRun
    ADD StartedByUserID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ContentProcessRun_User FOREIGN KEY REFERENCES ${flyway:defaultSchema}.[User](ID),
        TotalItemCount INT NULL,
        LastProcessedOffset INT NULL CONSTRAINT DF_ContentProcessRun_LastProcessedOffset DEFAULT 0,
        BatchSize INT NULL CONSTRAINT DF_ContentProcessRun_BatchSize DEFAULT 100,
        ErrorCount INT NULL CONSTRAINT DF_ContentProcessRun_ErrorCount DEFAULT 0,
        ErrorMessage NVARCHAR(MAX) NULL,
        CancellationRequested BIT NOT NULL CONSTRAINT DF_ContentProcessRun_CancellationRequested DEFAULT 0,
        Configuration NVARCHAR(MAX) NULL;
GO

-- Extended Properties
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The user who triggered this pipeline run. NULL for system-initiated runs.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='StartedByUserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total number of content items to process in this run. Used for progress percentage calculation.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='TotalItemCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'StartRow offset of the last successfully completed batch. Used for resume-from-crash: next batch starts at this offset. Reset to 0 on new runs.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='LastProcessedOffset';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of content items processed per batch. Configurable per run, default 100.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='BatchSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Running count of errors encountered during processing. Used by the circuit breaker to halt the pipeline if error rate exceeds the configured threshold.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='ErrorCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Error details if the run failed. Includes error messages, stack traces, or circuit breaker trigger reason.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='ErrorMessage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When set to 1, the pipeline stops after completing the current batch. Used for pause and cancel operations. The Status column reflects the final state (Paused or Cancelled).',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='CancellationRequested';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON snapshot of the pipeline configuration used for this run. Conforms to the IContentProcessRunConfiguration interface. Includes batch size, rate limits, error thresholds, and duplicate detection settings.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRun', @level2type=N'COLUMN', @level2name='Configuration';

----------------------------------------------------------------------
-- 2. ContentProcessRunDetail
----------------------------------------------------------------------

CREATE TABLE ${flyway:defaultSchema}.ContentProcessRunDetail (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ContentProcessRunID UNIQUEIDENTIFIER NOT NULL,
    ContentSourceID UNIQUEIDENTIFIER NOT NULL,
    ContentSourceTypeID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    ItemsProcessed INT NOT NULL DEFAULT 0,
    ItemsTagged INT NOT NULL DEFAULT 0,
    ItemsVectorized INT NOT NULL DEFAULT 0,
    TagsCreated INT NOT NULL DEFAULT 0,
    ErrorCount INT NOT NULL DEFAULT 0,
    StartTime DATETIMEOFFSET NULL,
    EndTime DATETIMEOFFSET NULL,
    TotalTokensUsed INT NOT NULL DEFAULT 0,
    TotalCost DECIMAL(18, 6) NOT NULL DEFAULT 0,
    CONSTRAINT PK_ContentProcessRunDetail PRIMARY KEY (ID),
    CONSTRAINT FK_ContentProcessRunDetail_Run FOREIGN KEY (ContentProcessRunID) REFERENCES ${flyway:defaultSchema}.ContentProcessRun(ID),
    CONSTRAINT FK_ContentProcessRunDetail_Source FOREIGN KEY (ContentSourceID) REFERENCES ${flyway:defaultSchema}.ContentSource(ID),
    CONSTRAINT FK_ContentProcessRunDetail_SourceType FOREIGN KEY (ContentSourceTypeID) REFERENCES ${flyway:defaultSchema}.ContentSourceType(ID)
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-content-source tracking within a pipeline run. Each source processed during a ContentProcessRun gets one detail record with item counts, timing, token usage, and cost rollups.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The parent pipeline run this detail belongs to.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ContentProcessRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The content source being processed in this detail record.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ContentSourceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The type of content source (RSS Feed, Entity, Website, Cloud Storage, etc.).',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ContentSourceTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Processing status: Pending, Running, Completed, Failed, or Skipped.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total content items processed for this source during the run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ItemsProcessed';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of content items successfully tagged by the LLM.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ItemsTagged';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of content items successfully embedded and upserted to the vector database.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ItemsVectorized';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of new ContentItemTag records created during LLM tagging.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='TagsCreated';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of errors encountered while processing this source.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='ErrorCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing started for this source within the pipeline run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='StartTime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing completed for this source within the pipeline run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='EndTime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Rollup of all tokens used across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='TotalTokensUsed';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Rollup of all costs across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunDetail', @level2type=N'COLUMN', @level2name='TotalCost';

----------------------------------------------------------------------
-- 3. ContentProcessRunPromptRun (Junction)
----------------------------------------------------------------------

CREATE TABLE ${flyway:defaultSchema}.ContentProcessRunPromptRun (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ContentProcessRunDetailID UNIQUEIDENTIFIER NOT NULL,
    AIPromptRunID UNIQUEIDENTIFIER NOT NULL,
    RunType NVARCHAR(20) NOT NULL,
    CONSTRAINT PK_ContentProcessRunPromptRun PRIMARY KEY (ID),
    CONSTRAINT FK_ContentProcessRunPromptRun_Detail FOREIGN KEY (ContentProcessRunDetailID) REFERENCES ${flyway:defaultSchema}.ContentProcessRunDetail(ID),
    CONSTRAINT FK_ContentProcessRunPromptRun_PromptRun FOREIGN KEY (AIPromptRunID) REFERENCES ${flyway:defaultSchema}.AIPromptRun(ID),
    CONSTRAINT CK_ContentProcessRunPromptRun_RunType CHECK (RunType IN ('Tag', 'Embed'))
);
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Links ContentProcessRunDetail records to their associated AIPromptRun records. Each LLM tagging call and embedding call creates an AIPromptRun, and this junction table provides the FK relationship for cost/token analytics.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The content process run detail record this prompt run is associated with.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun', @level2type=N'COLUMN', @level2name='ContentProcessRunDetailID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The AI prompt run record containing token usage, cost, model, vendor, and execution details for this call.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun', @level2type=N'COLUMN', @level2name='AIPromptRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this AIPromptRun was for LLM tagging (Tag) or text embedding (Embed).',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='ContentProcessRunPromptRun', @level2type=N'COLUMN', @level2name='RunType';

----------------------------------------------------------------------
-- 4. DuplicateRun extensions
----------------------------------------------------------------------

ALTER TABLE ${flyway:defaultSchema}.DuplicateRun
    ADD TotalItemCount INT NULL,
        ProcessedItemCount INT NULL CONSTRAINT DF_DuplicateRun_ProcessedItemCount DEFAULT 0,
        LastProcessedOffset INT NULL CONSTRAINT DF_DuplicateRun_LastProcessedOffset DEFAULT 0,
        BatchSize INT NULL CONSTRAINT DF_DuplicateRun_BatchSize DEFAULT 100,
        CancellationRequested BIT NOT NULL CONSTRAINT DF_DuplicateRun_CancellationRequested DEFAULT 0;
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total entity records to check for duplicates in this run.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='TotalItemCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of records checked so far. Used for progress percentage.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='ProcessedItemCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Resume cursor for large-scale duplicate detection. Stores the offset of the last completed batch.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='LastProcessedOffset';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of records processed per batch during duplicate detection.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='BatchSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When set to 1, duplicate detection stops after the current batch. Used for pause/cancel.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRun', @level2type=N'COLUMN', @level2name='CancellationRequested';

----------------------------------------------------------------------
-- 5. DuplicateRunDetail extensions
----------------------------------------------------------------------

ALTER TABLE ${flyway:defaultSchema}.DuplicateRunDetail
    ADD StartedAt DATETIMEOFFSET NULL,
        EndedAt DATETIMEOFFSET NULL;
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing started for this specific record during duplicate detection.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRunDetail', @level2type=N'COLUMN', @level2name='StartedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When processing completed for this specific record during duplicate detection.',
    @level0type=N'SCHEMA', @level0name='${flyway:defaultSchema}', @level1type=N'TABLE', @level1name='DuplicateRunDetail', @level2type=N'COLUMN', @level2name='EndedAt';















































-- ═══════════════════════════════════════════════════════════════════════════════
-- Knowledge Hub — Remaining Schema for Full Vision
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- This migration covers ALL remaining DDL for:
--   1. Taxonomy Governance (Tag lifecycle: status, merge tracking, audit trail)
--   2. Content Deduplication (cross-source near-duplicate detection)
--   3. Scheduled Pipeline Linking (tie KH pipelines to MJ ScheduledAction)
--   4. Search Enhancement (saved queries)
--   5. Tag Co-occurrence Analysis (materialized pair counts for taxonomy health
--      and cross-entity intelligence — pre-computed so we avoid expensive
--      self-joins on ContentItemTag every time we want "frequently paired tags")
--   6. Content Item status tracking (embedding + tagging lifecycle)
--
-- Prerequisites: V202604050001 (Large Scale Processing Infrastructure)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────
-- 1. TAXONOMY GOVERNANCE — Extend Tag table
-- ─────────────────────────────────────────────────

ALTER TABLE ${flyway:defaultSchema}.Tag
    ADD Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
        MergedIntoTagID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.Tag
    ADD CONSTRAINT CK_Tag_Status CHECK (Status IN ('Active', 'Merged', 'Deprecated', 'Deleted')),
        CONSTRAINT FK_Tag_MergedIntoTag FOREIGN KEY (MergedIntoTagID)
            REFERENCES ${flyway:defaultSchema}.Tag(ID);
GO


-- ─────────────────────────────────────────────────
-- 2. TAXONOMY GOVERNANCE — Tag Audit Log
-- ─────────────────────────────────────────────────

CREATE TABLE ${flyway:defaultSchema}.TagAuditLog (
    ID                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    TagID             UNIQUEIDENTIFIER NOT NULL,
    Action            NVARCHAR(30) NOT NULL,
    Details           NVARCHAR(MAX) NULL,
    PerformedByUserID UNIQUEIDENTIFIER NOT NULL,
    RelatedTagID      UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_TagAuditLog PRIMARY KEY (ID),
    CONSTRAINT FK_TagAuditLog_Tag FOREIGN KEY (TagID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT FK_TagAuditLog_User FOREIGN KEY (PerformedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_TagAuditLog_RelatedTag FOREIGN KEY (RelatedTagID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT CK_TagAuditLog_Action CHECK (Action IN (
        'Created', 'Renamed', 'Moved', 'Merged', 'Split',
        'Deprecated', 'Reactivated', 'Deleted', 'DescriptionChanged'
    ))
);
GO


-- ─────────────────────────────────────────────────
-- 3. CONTENT DEDUPLICATION — Cross-Source Duplicates
-- ─────────────────────────────────────────────────

CREATE TABLE ${flyway:defaultSchema}.ContentItemDuplicate (
    ID               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ContentItemAID   UNIQUEIDENTIFIER NOT NULL,
    ContentItemBID   UNIQUEIDENTIFIER NOT NULL,
    SimilarityScore  DECIMAL(5,4) NOT NULL,
    DetectionMethod  NVARCHAR(30) NOT NULL DEFAULT 'Checksum',
    Status           NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    ResolvedByUserID UNIQUEIDENTIFIER NULL,
    ResolvedAt       DATETIMEOFFSET NULL,
    Resolution       NVARCHAR(20) NULL,
    CONSTRAINT PK_ContentItemDuplicate PRIMARY KEY (ID),
    CONSTRAINT FK_ContentItemDuplicate_ItemA FOREIGN KEY (ContentItemAID)
        REFERENCES ${flyway:defaultSchema}.ContentItem(ID),
    CONSTRAINT FK_ContentItemDuplicate_ItemB FOREIGN KEY (ContentItemBID)
        REFERENCES ${flyway:defaultSchema}.ContentItem(ID),
    CONSTRAINT FK_ContentItemDuplicate_ResolvedBy FOREIGN KEY (ResolvedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_ContentItemDuplicate_Method CHECK (DetectionMethod IN ('Checksum', 'Vector', 'Title', 'URL')),
    CONSTRAINT CK_ContentItemDuplicate_Status CHECK (Status IN ('Pending', 'Confirmed', 'Dismissed', 'Merged')),
    CONSTRAINT CK_ContentItemDuplicate_Resolution CHECK (Resolution IN ('KeepA', 'KeepB', 'MergeBoth', 'NotDuplicate')),
    CONSTRAINT UQ_ContentItemDuplicate_Pair UNIQUE (ContentItemAID, ContentItemBID)
);
GO


-- ─────────────────────────────────────────────────
-- 4. TAG CO-OCCURRENCE — Materialized pair counts
-- ─────────────────────────────────────────────────

CREATE TABLE ${flyway:defaultSchema}.TagCoOccurrence (
    ID                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    TagAID            UNIQUEIDENTIFIER NOT NULL,
    TagBID            UNIQUEIDENTIFIER NOT NULL,
    CoOccurrenceCount INT NOT NULL DEFAULT 0,
    LastComputedAt    DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_TagCoOccurrence PRIMARY KEY (ID),
    CONSTRAINT FK_TagCoOccurrence_TagA FOREIGN KEY (TagAID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT FK_TagCoOccurrence_TagB FOREIGN KEY (TagBID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT UQ_TagCoOccurrence_Pair UNIQUE (TagAID, TagBID)
);
GO


-- ─────────────────────────────────────────────────
-- 5. SCHEDULED PIPELINE + CONTENT ITEM STATUS — ALTER existing tables
-- ─────────────────────────────────────────────────

-- ContentSource: link to scheduled pipeline action
ALTER TABLE ${flyway:defaultSchema}.ContentSource
    ADD ScheduledActionID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentSource
    ADD CONSTRAINT FK_ContentSource_ScheduledAction FOREIGN KEY (ScheduledActionID)
        REFERENCES ${flyway:defaultSchema}.ScheduledAction(ID);
GO

-- ContentItem: embedding + tagging lifecycle tracking
ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD EmbeddingStatus  NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        LastEmbeddedAt   DATETIMEOFFSET NULL,
        EmbeddingModelID UNIQUEIDENTIFIER NULL,
        TaggingStatus    NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        LastTaggedAt     DATETIMEOFFSET NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.ContentItem
    ADD CONSTRAINT CK_ContentItem_EmbeddingStatus CHECK (EmbeddingStatus IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped')),
        CONSTRAINT CK_ContentItem_TaggingStatus CHECK (TaggingStatus IN ('Pending', 'Processing', 'Complete', 'Failed', 'Skipped')),
        CONSTRAINT FK_ContentItem_EmbeddingModel FOREIGN KEY (EmbeddingModelID)
            REFERENCES ${flyway:defaultSchema}.AIModel(ID);
GO


-- ─────────────────────────────────────────────────
-- 6. SEARCH ENHANCEMENT — Saved Searches
-- ─────────────────────────────────────────────────

CREATE TABLE ${flyway:defaultSchema}.KnowledgeHubSavedSearch (
    ID                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    UserID             UNIQUEIDENTIFIER NOT NULL,
    Name               NVARCHAR(255) NOT NULL,
    Query              NVARCHAR(1000) NOT NULL,
    Filters            NVARCHAR(MAX) NULL,
    MinScore           DECIMAL(3,2) NULL,
    MaxResults         INT NULL DEFAULT 50,
    NotifyOnNewResults BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_KnowledgeHubSavedSearch PRIMARY KEY (ID),
    CONSTRAINT FK_KnowledgeHubSavedSearch_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID)
);
GO


-- ═══════════════════════════════════════════════════════════════════════════════
-- EXTENDED PROPERTIES — grouped by table
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Tag ──

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lifecycle status of the tag: Active (in use), Merged (consolidated into another tag), Deprecated (no longer assigned but preserved), Deleted (soft-deleted).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Tag',
    @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When Status is Merged, points to the surviving tag this tag was merged into. All TaggedItem and ContentItemTag references are re-pointed during merge.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Tag',
    @level2type=N'COLUMN', @level2name=N'MergedIntoTagID';
GO

-- ── TagAuditLog ──

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Immutable audit trail for all tag taxonomy changes. Each row records a single action with before/after details in JSON.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagAuditLog';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The tag that was acted upon.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagAuditLog',
    @level2type=N'COLUMN', @level2name=N'TagID';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The type of action performed: Created, Renamed, Moved (parent changed), Merged (into RelatedTagID), Split (from RelatedTagID), Deprecated, Reactivated, Deleted, DescriptionChanged.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagAuditLog',
    @level2type=N'COLUMN', @level2name=N'Action';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object with action-specific details. For Renamed: {"OldName":"...","NewName":"..."}. For Moved: {"OldParentID":"...","NewParentID":"..."}. For Merged: {"ItemsMoved":42}.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagAuditLog',
    @level2type=N'COLUMN', @level2name=N'Details';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User who performed the action.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagAuditLog',
    @level2type=N'COLUMN', @level2name=N'PerformedByUserID';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For Merged actions: the surviving tag. For Split actions: the source tag. NULL for other actions.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagAuditLog',
    @level2type=N'COLUMN', @level2name=N'RelatedTagID';
GO

-- ── ContentItemDuplicate ──

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Detected duplicate or near-duplicate content items across sources. Each row represents a pair of items with similarity scoring and resolution tracking.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItemDuplicate';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cosine similarity (for Vector) or exact match score (1.0 for Checksum/URL). Range 0.0-1.0.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItemDuplicate',
    @level2type=N'COLUMN', @level2name=N'SimilarityScore';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How the duplicate was detected: Checksum (identical text hash), Vector (embedding similarity), Title (same title text), URL (same source URL).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItemDuplicate',
    @level2type=N'COLUMN', @level2name=N'DetectionMethod';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current status: Pending (awaiting review), Confirmed (verified duplicate), Dismissed (not a duplicate), Merged (one item was removed).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItemDuplicate',
    @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How the duplicate was resolved: KeepA (keep first, remove second), KeepB (keep second, remove first), MergeBoth (combine into one), NotDuplicate (false positive).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItemDuplicate',
    @level2type=N'COLUMN', @level2name=N'Resolution';
GO

-- ── TagCoOccurrence ──

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Materialized co-occurrence counts for tag pairs. Records how many content items share both tags. Used for taxonomy health analysis, merge suggestions, and cross-entity intelligence. Recomputed periodically by the pipeline.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagCoOccurrence';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of content items (or entity records via TaggedItem) that are tagged with both TagA and TagB.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagCoOccurrence',
    @level2type=N'COLUMN', @level2name=N'CoOccurrenceCount';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'First tag in the canonical pair (TagAID < TagBID ensures each pair is stored exactly once).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'TagCoOccurrence',
    @level2type=N'COLUMN', @level2name=N'TagAID';
GO

-- ── ContentSource ──

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional link to a MJ Scheduled Action that automatically runs the classification pipeline for this source on a cron schedule.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentSource',
    @level2type=N'COLUMN', @level2name=N'ScheduledActionID';
GO

-- ── ContentItem ──

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Vectorization status: Pending (not yet embedded), Processing (currently being embedded), Complete (vector stored), Failed (embedding error), Skipped (excluded from vectorization).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItem',
    @level2type=N'COLUMN', @level2name=N'EmbeddingStatus';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of the most recent successful embedding for this content item.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItem',
    @level2type=N'COLUMN', @level2name=N'LastEmbeddedAt';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The AI model used to generate the most recent embedding for this content item.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItem',
    @level2type=N'COLUMN', @level2name=N'EmbeddingModelID';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Autotagging status: Pending (not yet tagged), Processing (LLM is generating tags), Complete (tags assigned), Failed (LLM error), Skipped (excluded from tagging).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItem',
    @level2type=N'COLUMN', @level2name=N'TaggingStatus';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp of the most recent successful autotagging run for this content item.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'ContentItem',
    @level2type=N'COLUMN', @level2name=N'LastTaggedAt';
GO

-- ── KnowledgeHubSavedSearch ──

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User-saved search queries for the Knowledge Hub. Stores query text, active filters (JSON), and score thresholds so searches can be recalled or run on a schedule.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'KnowledgeHubSavedSearch';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object with active filter selections. Keys are filter categories (Entity, Tags), values are arrays of selected option values.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'KnowledgeHubSavedSearch',
    @level2type=N'COLUMN', @level2name=N'Filters';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When enabled, the system will notify the user when new results match this saved search (future capability).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'KnowledgeHubSavedSearch',
    @level2type=N'COLUMN', @level2name=N'NotifyOnNewResults';
GO


-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — Summary of changes:
--
--  Tag:                     +Status, +MergedIntoTagID (1 ALTER TABLE + 1 constraints)
--  TagAuditLog:             NEW TABLE (immutable audit trail)
--  ContentItemDuplicate:    NEW TABLE (cross-source dedup)
--  TagCoOccurrence:         NEW TABLE (materialized pair counts)
--  ContentSource:           +ScheduledActionID (1 ALTER TABLE + 1 FK)
--  ContentItem:             +EmbeddingStatus, +LastEmbeddedAt, +EmbeddingModelID,
--                           +TaggingStatus, +LastTaggedAt (1 ALTER TABLE + 1 constraints)
--  KnowledgeHubSavedSearch: NEW TABLE (user saved queries)
-- ═══════════════════════════════════════════════════════════════════════════════




















































































-- REFRESH METADATA AND RECOMPILE OBJECTS BEFORE RUNNING CODE GEN'S EMITTED OUTPUT

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1



































-- CODE GEN RUN NEXT
/* SQL generated to create new entity MJ: Tag Audit Logs */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '30cb615e-d556-46de-9e15-ced108fcee84',
         'MJ: Tag Audit Logs',
         'Tag Audit Logs',
         'Immutable audit trail for all tag taxonomy changes. Each row records a single action with before/after details in JSON.',
         NULL,
         'TagAuditLog',
         'vwTagAuditLogs',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Tag Audit Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '30cb615e-d556-46de-9e15-ced108fcee84', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('30cb615e-d556-46de-9e15-ced108fcee84', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('30cb615e-d556-46de-9e15-ced108fcee84', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('30cb615e-d556-46de-9e15-ced108fcee84', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Content Item Duplicates */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5',
         'MJ: Content Item Duplicates',
         'Content Item Duplicates',
         'Detected duplicate or near-duplicate content items across sources. Each row represents a pair of items with similarity scoring and resolution tracking.',
         NULL,
         'ContentItemDuplicate',
         'vwContentItemDuplicates',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Content Item Duplicates to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3c7e3ee9-beba-49b2-ab61-9bafa1b40ee5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Tag Co Occurrences */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'c353db72-de7c-4674-98d0-d4ddb9d41571',
         'MJ: Tag Co Occurrences',
         'Tag Co Occurrences',
         'Materialized co-occurrence counts for tag pairs. Records how many content items share both tags. Used for taxonomy health analysis, merge suggestions, and cross-entity intelligence. Recomputed periodically by the pipeline.',
         NULL,
         'TagCoOccurrence',
         'vwTagCoOccurrences',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Tag Co Occurrences to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c353db72-de7c-4674-98d0-d4ddb9d41571', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c353db72-de7c-4674-98d0-d4ddb9d41571', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c353db72-de7c-4674-98d0-d4ddb9d41571', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c353db72-de7c-4674-98d0-d4ddb9d41571', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Knowledge Hub Saved Searches */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'e5a86e2b-be0b-4344-8d45-32d6f0c850ea',
         'MJ: Knowledge Hub Saved Searches',
         'Knowledge Hub Saved Searches',
         'User-saved search queries for the Knowledge Hub. Stores query text, active filters (JSON), and score thresholds so searches can be recalled or run on a schedule.',
         NULL,
         'KnowledgeHubSavedSearch',
         'vwKnowledgeHubSavedSearches',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Knowledge Hub Saved Searches to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e5a86e2b-be0b-4344-8d45-32d6f0c850ea', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e5a86e2b-be0b-4344-8d45-32d6f0c850ea', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e5a86e2b-be0b-4344-8d45-32d6f0c850ea', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e5a86e2b-be0b-4344-8d45-32d6f0c850ea', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Content Process Run Details */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '4a1ef567-f71f-44a3-9728-fb724062e619',
         'MJ: Content Process Run Details',
         'Content Process Run Details',
         'Per-content-source tracking within a pipeline run. Each source processed during a ContentProcessRun gets one detail record with item counts, timing, token usage, and cost rollups.',
         NULL,
         'ContentProcessRunDetail',
         'vwContentProcessRunDetails',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Content Process Run Details to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4a1ef567-f71f-44a3-9728-fb724062e619', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Details for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4a1ef567-f71f-44a3-9728-fb724062e619', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Details for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4a1ef567-f71f-44a3-9728-fb724062e619', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Details for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4a1ef567-f71f-44a3-9728-fb724062e619', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Content Process Run Prompt Runs */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15',
         'MJ: Content Process Run Prompt Runs',
         'Content Process Run Prompt Runs',
         'Links ContentProcessRunDetail records to their associated AIPromptRun records. Each LLM tagging call and embedding call creates an AIPromptRun, and this junction table provides the FK relationship for cost/token analytics.',
         NULL,
         'ContentProcessRunPromptRun',
         'vwContentProcessRunPromptRuns',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      )
   

/* SQL generated to add new entity MJ: Content Process Run Prompt Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Process Run Prompt Runs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7ad7a0e4-0c8b-4131-9c6d-a7d90247cd15', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

GO
/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
UPDATE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD CONSTRAINT [DF___mj_KnowledgeHubSavedSearch___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
UPDATE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD CONSTRAINT [DF___mj_KnowledgeHubSavedSearch___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
UPDATE [${flyway:defaultSchema}].[ContentItemDuplicate] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD CONSTRAINT [DF___mj_ContentItemDuplicate___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
UPDATE [${flyway:defaultSchema}].[ContentItemDuplicate] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD CONSTRAINT [DF___mj_ContentItemDuplicate___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD CONSTRAINT [DF___mj_ContentProcessRunPromptRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunPromptRun */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ADD CONSTRAINT [DF___mj_ContentProcessRunPromptRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
UPDATE [${flyway:defaultSchema}].[TagAuditLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD CONSTRAINT [DF___mj_TagAuditLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
UPDATE [${flyway:defaultSchema}].[TagAuditLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD CONSTRAINT [DF___mj_TagAuditLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
UPDATE [${flyway:defaultSchema}].[TagCoOccurrence] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD CONSTRAINT [DF___mj_TagCoOccurrence___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
UPDATE [${flyway:defaultSchema}].[TagCoOccurrence] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD CONSTRAINT [DF___mj_TagCoOccurrence___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunDetail] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD CONSTRAINT [DF___mj_ContentProcessRunDetail___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
UPDATE [${flyway:defaultSchema}].[ContentProcessRunDetail] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentProcessRunDetail */
ALTER TABLE [${flyway:defaultSchema}].[ContentProcessRunDetail] ADD CONSTRAINT [DF___mj_ContentProcessRunDetail___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef451377-bb03-44be-8847-1ad05dbbe35c' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'ID')) BEGIN
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
            'ef451377-bb03-44be-8847-1ad05dbbe35c',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb748be8-f23a-4d4d-876e-f892973fbe00' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'UserID')) BEGIN
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
            'eb748be8-f23a-4d4d-876e-f892973fbe00',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100002,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95b2ce20-2228-4b07-b973-aada70961477' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'Name')) BEGIN
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
            '95b2ce20-2228-4b07-b973-aada70961477',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100003,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f759b7c5-13e2-4359-ab28-f16eef9be1f4' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'Query')) BEGIN
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
            'f759b7c5-13e2-4359-ab28-f16eef9be1f4',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100004,
            'Query',
            'Query',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '906b2cc8-8a68-4a78-8c1a-16213d2efd9b' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'Filters')) BEGIN
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
            '906b2cc8-8a68-4a78-8c1a-16213d2efd9b',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100005,
            'Filters',
            'Filters',
            'JSON object with active filter selections. Keys are filter categories (Entity, Tags), values are arrays of selected option values.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1586777b-02ad-42cb-a253-ca9133845eca' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'MinScore')) BEGIN
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
            '1586777b-02ad-42cb-a253-ca9133845eca',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100006,
            'MinScore',
            'Min Score',
            NULL,
            'decimal',
            5,
            3,
            2,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f25ba9c1-f392-4b50-9743-27b0a6a25c71' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'MaxResults')) BEGIN
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
            'f25ba9c1-f392-4b50-9743-27b0a6a25c71',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100007,
            'MaxResults',
            'Max Results',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            '(50)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '332734cb-8e0a-4dab-8ee7-386fb4576862' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'NotifyOnNewResults')) BEGIN
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
            '332734cb-8e0a-4dab-8ee7-386fb4576862',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100008,
            'NotifyOnNewResults',
            'Notify On New Results',
            'When enabled, the system will notify the user when new results match this saved search (future capability).',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8936a4fd-2e69-471c-b508-e3aa1f289612' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = '__mj_CreatedAt')) BEGIN
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
            '8936a4fd-2e69-471c-b508-e3aa1f289612',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100009,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2862182a-6190-44f4-a5a1-3a0fb2a3824f' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2862182a-6190-44f4-a5a1-3a0fb2a3824f',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100010,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44b30122-35f7-4954-82aa-329f26486ed5' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Status')) BEGIN
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
            '44b30122-35f7-4954-82aa-329f26486ed5',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100017,
            'Status',
            'Status',
            'Lifecycle status of the tag: Active (in use), Merged (consolidated into another tag), Deprecated (no longer assigned but preserved), Deleted (soft-deleted).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23e00fa1-c0b5-4370-b526-78f65f2571d2' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MergedIntoTagID')) BEGIN
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
            '23e00fa1-c0b5-4370-b526-78f65f2571d2',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100018,
            'MergedIntoTagID',
            'Merged Into Tag ID',
            'When Status is Merged, points to the surviving tag this tag was merged into. All TaggedItem and ContentItemTag references are re-pointed during merge.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '0C248F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a829129f-3ac3-4945-aca0-075a3cb6cb22' OR (EntityID = '0D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Weight')) BEGIN
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
            'a829129f-3ac3-4945-aca0-075a3cb6cb22',
            '0D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tagged Items
            100015,
            'Weight',
            'Weight',
            'Relevance weight of this tag association (0.0 to 1.0). 1.0 indicates the tag is highly relevant or was manually applied. Lower values indicate decreasing relevance as determined by LLM autotagging. Default 1.0 for manually applied tags.',
            'numeric',
            5,
            5,
            4,
            0,
            '(1.0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2af32154-3b29-4138-8b1f-5e4441e1ece3' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TotalItemCount')) BEGIN
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
            '2af32154-3b29-4138-8b1f-5e4441e1ece3',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100031,
            'TotalItemCount',
            'Total Item Count',
            'Total entity records to check for duplicates in this run.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af9aaa70-8d37-40d7-b199-a8ce50280187' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ProcessedItemCount')) BEGIN
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
            'af9aaa70-8d37-40d7-b199-a8ce50280187',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100032,
            'ProcessedItemCount',
            'Processed Item Count',
            'Number of records checked so far. Used for progress percentage.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5345c54-99d1-48e0-9fb4-e446becfc636' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LastProcessedOffset')) BEGIN
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
            'f5345c54-99d1-48e0-9fb4-e446becfc636',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100033,
            'LastProcessedOffset',
            'Last Processed Offset',
            'Resume cursor for large-scale duplicate detection. Stores the offset of the last completed batch.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81a0ae82-e71b-4cd1-bbee-e736e33e5021' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'BatchSize')) BEGIN
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
            '81a0ae82-e71b-4cd1-bbee-e736e33e5021',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100034,
            'BatchSize',
            'Batch Size',
            'Number of records processed per batch during duplicate detection.',
            'int',
            4,
            10,
            0,
            1,
            '(100)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18316158-4d88-4c83-b3aa-8dda18fece5d' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CancellationRequested')) BEGIN
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
            '18316158-4d88-4c83-b3aa-8dda18fece5d',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            100035,
            'CancellationRequested',
            'Cancellation Requested',
            'When set to 1, duplicate detection stops after the current batch. Used for pause/cancel.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4507c2ec-b47e-4832-9caf-f26c8e0121cb' OR (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'StartedAt')) BEGIN
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
            '4507c2ec-b47e-4832-9caf-f26c8e0121cb',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Run Details
            100024,
            'StartedAt',
            'Started At',
            'When processing started for this specific record during duplicate detection.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc89e545-1458-43b8-b0a9-c0a5063752be' OR (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EndedAt')) BEGIN
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
            'dc89e545-1458-43b8-b0a9-c0a5063752be',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Run Details
            100025,
            'EndedAt',
            'Ended At',
            'When processing completed for this specific record during duplicate detection.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6384381-dd5e-4454-9cc6-120896ae4688' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ID')) BEGIN
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
            'a6384381-dd5e-4454-9cc6-120896ae4688',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d4a467c-84b7-4a3e-9bd5-b7187a656194' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ContentItemAID')) BEGIN
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
            '7d4a467c-84b7-4a3e-9bd5-b7187a656194',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100002,
            'ContentItemAID',
            'Content Item AID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '617f8d8a-c680-4fd6-83cc-f87ae7b4493c' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ContentItemBID')) BEGIN
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
            '617f8d8a-c680-4fd6-83cc-f87ae7b4493c',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100003,
            'ContentItemBID',
            'Content Item BID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd9010d3-5655-4437-8479-d697eed29e74' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'SimilarityScore')) BEGIN
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
            'dd9010d3-5655-4437-8479-d697eed29e74',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100004,
            'SimilarityScore',
            'Similarity Score',
            'Cosine similarity (for Vector) or exact match score (1.0 for Checksum/URL). Range 0.0-1.0.',
            'decimal',
            5,
            5,
            4,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c50db26e-dfb3-4175-8341-16bbe598a7e8' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'DetectionMethod')) BEGIN
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
            'c50db26e-dfb3-4175-8341-16bbe598a7e8',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100005,
            'DetectionMethod',
            'Detection Method',
            'How the duplicate was detected: Checksum (identical text hash), Vector (embedding similarity), Title (same title text), URL (same source URL).',
            'nvarchar',
            60,
            0,
            0,
            0,
            'Checksum',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4ba647b-4eb5-48a8-832f-a5b02f55d4ad' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'Status')) BEGIN
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
            'c4ba647b-4eb5-48a8-832f-a5b02f55d4ad',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100006,
            'Status',
            'Status',
            'Current status: Pending (awaiting review), Confirmed (verified duplicate), Dismissed (not a duplicate), Merged (one item was removed).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cfa6ce2-0ce9-4ce9-9365-f385b4907d21' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ResolvedByUserID')) BEGIN
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
            '0cfa6ce2-0ce9-4ce9-9365-f385b4907d21',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100007,
            'ResolvedByUserID',
            'Resolved By User ID',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2cbf664d-7bf3-4e48-87ab-20827a225870' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ResolvedAt')) BEGIN
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
            '2cbf664d-7bf3-4e48-87ab-20827a225870',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100008,
            'ResolvedAt',
            'Resolved At',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32d4867d-f445-4578-aabb-ce5ccd2e3f2f' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'Resolution')) BEGIN
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
            '32d4867d-f445-4578-aabb-ce5ccd2e3f2f',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100009,
            'Resolution',
            'Resolution',
            'How the duplicate was resolved: KeepA (keep first, remove second), KeepB (keep second, remove first), MergeBoth (combine into one), NotDuplicate (false positive).',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '284b7fc6-1f8e-4038-a496-c28741a65c75' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = '__mj_CreatedAt')) BEGIN
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
            '284b7fc6-1f8e-4038-a496-c28741a65c75',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d3bf8a8-4ea6-41f8-8f66-11af622f54e7' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4d3bf8a8-4ea6-41f8-8f66-11af622f54e7',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3341bdde-4619-4a25-8be4-d88891362821' OR (EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND Name = 'ID')) BEGIN
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
            '3341bdde-4619-4a25-8be4-d88891362821',
            '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- Entity: MJ: Content Process Run Prompt Runs
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0bebcc5a-2839-41f0-b8e1-765485da22a7' OR (EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND Name = 'ContentProcessRunDetailID')) BEGIN
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
            '0bebcc5a-2839-41f0-b8e1-765485da22a7',
            '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- Entity: MJ: Content Process Run Prompt Runs
            100002,
            'ContentProcessRunDetailID',
            'Content Process Run Detail ID',
            'The content process run detail record this prompt run is associated with.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '4A1EF567-F71F-44A3-9728-FB724062E619',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7eb9f962-577d-4fe2-ae00-4f402ce19bfa' OR (EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND Name = 'AIPromptRunID')) BEGIN
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
            '7eb9f962-577d-4fe2-ae00-4f402ce19bfa',
            '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- Entity: MJ: Content Process Run Prompt Runs
            100003,
            'AIPromptRunID',
            'AI Prompt Run ID',
            'The AI prompt run record containing token usage, cost, model, vendor, and execution details for this call.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f6e688c-e0c4-458b-9e42-2b2bbf1ec8dc' OR (EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND Name = 'RunType')) BEGIN
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
            '2f6e688c-e0c4-458b-9e42-2b2bbf1ec8dc',
            '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- Entity: MJ: Content Process Run Prompt Runs
            100004,
            'RunType',
            'Run Type',
            'Whether this AIPromptRun was for LLM tagging (Tag) or text embedding (Embed).',
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '798cba36-02e7-467e-aec9-88737953b466' OR (EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND Name = '__mj_CreatedAt')) BEGIN
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
            '798cba36-02e7-467e-aec9-88737953b466',
            '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- Entity: MJ: Content Process Run Prompt Runs
            100005,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb1a20a3-4de9-4760-86e2-b9f98f974b6a' OR (EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'fb1a20a3-4de9-4760-86e2-b9f98f974b6a',
            '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- Entity: MJ: Content Process Run Prompt Runs
            100006,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21d1b5e7-1266-4f46-8f29-7de40725428a' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'StartedByUserID')) BEGIN
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
            '21d1b5e7-1266-4f46-8f29-7de40725428a',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100018,
            'StartedByUserID',
            'Started By User ID',
            'The user who triggered this pipeline run. NULL for system-initiated runs.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7f91b01-92fe-4eeb-be1b-edb4cfd3f056' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'TotalItemCount')) BEGIN
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
            'f7f91b01-92fe-4eeb-be1b-edb4cfd3f056',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100019,
            'TotalItemCount',
            'Total Item Count',
            'Total number of content items to process in this run. Used for progress percentage calculation.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '514b02d3-eec7-4e9a-82c3-302b0cf363dd' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastProcessedOffset')) BEGIN
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
            '514b02d3-eec7-4e9a-82c3-302b0cf363dd',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100020,
            'LastProcessedOffset',
            'Last Processed Offset',
            'StartRow offset of the last successfully completed batch. Used for resume-from-crash: next batch starts at this offset. Reset to 0 on new runs.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad6b86eb-82fc-45cf-a588-049b3ee24079' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'BatchSize')) BEGIN
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
            'ad6b86eb-82fc-45cf-a588-049b3ee24079',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100021,
            'BatchSize',
            'Batch Size',
            'Number of content items processed per batch. Configurable per run, default 100.',
            'int',
            4,
            10,
            0,
            1,
            '(100)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b5f5cf6-45c6-4025-bd44-0bea11d0bed1' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ErrorCount')) BEGIN
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
            '2b5f5cf6-45c6-4025-bd44-0bea11d0bed1',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100022,
            'ErrorCount',
            'Error Count',
            'Running count of errors encountered during processing. Used by the circuit breaker to halt the pipeline if error rate exceeds the configured threshold.',
            'int',
            4,
            10,
            0,
            1,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa318dcb-3d56-4361-9121-c02ada74bfdb' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ErrorMessage')) BEGIN
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
            'aa318dcb-3d56-4361-9121-c02ada74bfdb',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100023,
            'ErrorMessage',
            'Error Message',
            'Error details if the run failed. Includes error messages, stack traces, or circuit breaker trigger reason.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce6234bd-e9f5-41f4-838f-f415bee64b1a' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'CancellationRequested')) BEGIN
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
            'ce6234bd-e9f5-41f4-838f-f415bee64b1a',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100024,
            'CancellationRequested',
            'Cancellation Requested',
            'When set to 1, the pipeline stops after completing the current batch. Used for pause and cancel operations. The Status column reflects the final state (Paused or Cancelled).',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16759e5c-8fa0-4816-867a-2504489c4ffd' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
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
            '16759e5c-8fa0-4816-867a-2504489c4ffd',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100025,
            'Configuration',
            'Configuration',
            'JSON snapshot of the pipeline configuration used for this run. Conforms to the IContentProcessRunConfiguration interface. Includes batch size, rate limits, error thresholds, and duplicate detection settings.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3402501e-8128-40e0-bcf8-1bc2867c3931' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
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
            '3402501e-8128-40e0-bcf8-1bc2867c3931',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100026,
            'Configuration',
            'Configuration',
            'JSON configuration blob for source-instance settings. Conforms to the IContentSourceConfiguration interface. Includes tag taxonomy mode (constrained/auto-grow/free-flow), tag root ID, match threshold, LLM taxonomy sharing, and vectorization toggle.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f8aec67-cbbb-47be-96c8-70795f10849c' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityID')) BEGIN
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
            '3f8aec67-cbbb-47be-96c8-70795f10849c',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100027,
            'EntityID',
            'Entity ID',
            'For Entity-type content sources, the MJ Entity to pull records from. NULL for non-entity sources (files, RSS, websites, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bfd47b8-2b7b-4d5e-af0f-510b6da68faa' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityDocumentID')) BEGIN
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
            '7bfd47b8-2b7b-4d5e-af0f-510b6da68faa',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100028,
            'EntityDocumentID',
            'Entity Document ID',
            'For Entity-type content sources, the Entity Document template used to render entity records into text for autotagging. The template defines which fields to include, how to format them, and related record inclusion. NULL for non-entity sources.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '22248F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08929b56-9f28-4bb0-9f68-d783e68b8b27' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ScheduledActionID')) BEGIN
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
            '08929b56-9f28-4bb0-9f68-d783e68b8b27',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100029,
            'ScheduledActionID',
            'Scheduled Action ID',
            'Optional link to a MJ Scheduled Action that automatically runs the classification pipeline for this source on a cron schedule.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '12CD5A5D-A83B-EF11-86D4-0022481D1B23',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77daca3c-60b0-426b-9dd8-98597f2c8ebb' OR (EntityID = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'DriverClass')) BEGIN
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
            '77daca3c-60b0-426b-9dd8-98597f2c8ebb',
            'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Source Types
            100011,
            'DriverClass',
            'Driver Class',
            'The registered class name used by ClassFactory to instantiate the provider for this source type (e.g., AutotagLocalFileSystem, AutotagEntity). Must match a @RegisterClass key on a class extending AutotagBase.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6988131-fd6d-4e8c-aaaa-143d70f6ac1d' OR (EntityID = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
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
            'f6988131-fd6d-4e8c-aaaa-143d70f6ac1d',
            'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Source Types
            100012,
            'Configuration',
            'Configuration',
            'JSON configuration blob for type-level settings. Conforms to the IContentSourceTypeConfiguration interface. Reserved for future type-wide settings shared by all sources of this type.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '399cbc27-d03e-4230-9ae3-547e14651719' OR (EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Configuration')) BEGIN
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
            '399cbc27-d03e-4230-9ae3-547e14651719',
            'A793AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Types
            100024,
            'Configuration',
            'Configuration',
            'JSON configuration blob for content-type-level settings. Conforms to the IContentTypeConfiguration interface. Reserved for future type-wide settings such as default tag taxonomy rules and processing options.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b813e21c-9a7b-4de5-8577-7955a279cf7c' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityRecordDocumentID')) BEGIN
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
            'b813e21c-9a7b-4de5-8577-7955a279cf7c',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100029,
            'EntityRecordDocumentID',
            'Entity Record Document ID',
            'For entity-sourced content items, links to the Entity Record Document snapshot that was rendered for this item. Provides traceability back to the source entity record via ERD.EntityID + ERD.RecordID. NULL for non-entity sources.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '21248F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41209810-b679-44c8-82a1-a5a6e5057616' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingStatus')) BEGIN
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
            '41209810-b679-44c8-82a1-a5a6e5057616',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100030,
            'EmbeddingStatus',
            'Embedding Status',
            'Vectorization status: Pending (not yet embedded), Processing (currently being embedded), Complete (vector stored), Failed (embedding error), Skipped (excluded from vectorization).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6331b8ce-6fba-4095-b65d-8f647c494a19' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastEmbeddedAt')) BEGIN
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
            '6331b8ce-6fba-4095-b65d-8f647c494a19',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100031,
            'LastEmbeddedAt',
            'Last Embedded At',
            'Timestamp of the most recent successful embedding for this content item.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38997a21-b71b-4a05-a8bb-68dc1cc12762' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModelID')) BEGIN
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
            '38997a21-b71b-4a05-a8bb-68dc1cc12762',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100032,
            'EmbeddingModelID',
            'Embedding Model ID',
            'The AI model used to generate the most recent embedding for this content item.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65c6e744-d91c-4d0f-84f9-16fac676b498' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'TaggingStatus')) BEGIN
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
            '65c6e744-d91c-4d0f-84f9-16fac676b498',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100033,
            'TaggingStatus',
            'Tagging Status',
            'Autotagging status: Pending (not yet tagged), Processing (LLM is generating tags), Complete (tags assigned), Failed (LLM error), Skipped (excluded from tagging).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc13ee1e-7485-4db3-af95-1014c36ee9d2' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastTaggedAt')) BEGIN
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
            'cc13ee1e-7485-4db3-af95-1014c36ee9d2',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100034,
            'LastTaggedAt',
            'Last Tagged At',
            'Timestamp of the most recent successful autotagging run for this content item.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a074747-d77b-446c-8b10-204459643ff9' OR (EntityID = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'TagID')) BEGIN
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
            '5a074747-d77b-446c-8b10-204459643ff9',
            'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Item Tags
            100014,
            'TagID',
            'Tag ID',
            'Optional link to the formal MJ Tag taxonomy. When set, this free-text tag has been matched (via semantic similarity or exact match) to a curated Tag record. NULL means the tag is unmatched free text only.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '0C248F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6daf6ba0-0646-4cfb-8ad7-8a9e1e2bba42' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'ID')) BEGIN
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
            '6daf6ba0-0646-4cfb-8ad7-8a9e1e2bba42',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46cd46ea-a20b-4a44-af88-083aab58d441' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'TagID')) BEGIN
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
            '46cd46ea-a20b-4a44-af88-083aab58d441',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100002,
            'TagID',
            'Tag ID',
            'The tag that was acted upon.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '0C248F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e245d79-0054-4c21-a585-dd7d9a786c02' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'Action')) BEGIN
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
            '7e245d79-0054-4c21-a585-dd7d9a786c02',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100003,
            'Action',
            'Action',
            'The type of action performed: Created, Renamed, Moved (parent changed), Merged (into RelatedTagID), Split (from RelatedTagID), Deprecated, Reactivated, Deleted, DescriptionChanged.',
            'nvarchar',
            60,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8552a352-55e9-4dac-b66c-6a8c6ab6dd6c' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'Details')) BEGIN
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
            '8552a352-55e9-4dac-b66c-6a8c6ab6dd6c',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100004,
            'Details',
            'Details',
            'JSON object with action-specific details. For Renamed: {"OldName":"...","NewName":"..."}. For Moved: {"OldParentID":"...","NewParentID":"..."}. For Merged: {"ItemsMoved":42}.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f9c0fd7-6f54-4155-94b8-dd71d886d200' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'PerformedByUserID')) BEGIN
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
            '5f9c0fd7-6f54-4155-94b8-dd71d886d200',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100005,
            'PerformedByUserID',
            'Performed By User ID',
            'User who performed the action.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d390d4f-8cca-478a-b7d0-6086bec11c67' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'RelatedTagID')) BEGIN
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
            '1d390d4f-8cca-478a-b7d0-6086bec11c67',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100006,
            'RelatedTagID',
            'Related Tag ID',
            'For Merged actions: the surviving tag. For Split actions: the source tag. NULL for other actions.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '0C248F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '496d6c09-87ef-4964-8ee2-697e9a7cda34' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = '__mj_CreatedAt')) BEGIN
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
            '496d6c09-87ef-4964-8ee2-697e9a7cda34',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5991821a-3b5c-486c-88fa-2c9914130aa1' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5991821a-3b5c-486c-88fa-2c9914130aa1',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52e92f58-d34c-4b58-9cdf-d6f85b80822f' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = 'ID')) BEGIN
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
            '52e92f58-d34c-4b58-9cdf-d6f85b80822f',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d039b78-f386-439a-a952-240fd964a9ce' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = 'TagAID')) BEGIN
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
            '6d039b78-f386-439a-a952-240fd964a9ce',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100002,
            'TagAID',
            'Tag AID',
            'First tag in the canonical pair (TagAID < TagBID ensures each pair is stored exactly once).',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '0C248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37eb7cdb-4e0a-48d2-bbb5-d84f61847df9' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = 'TagBID')) BEGIN
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
            '37eb7cdb-4e0a-48d2-bbb5-d84f61847df9',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100003,
            'TagBID',
            'Tag BID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '0C248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0bd8b24-d8f2-4005-98e1-ad4fc64b557a' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = 'CoOccurrenceCount')) BEGIN
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
            'a0bd8b24-d8f2-4005-98e1-ad4fc64b557a',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100004,
            'CoOccurrenceCount',
            'Co Occurrence Count',
            'Number of content items (or entity records via TaggedItem) that are tagged with both TagA and TagB.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'da798589-ecf6-406c-8d6d-0f2b3a4ead00' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = 'LastComputedAt')) BEGIN
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
            'da798589-ecf6-406c-8d6d-0f2b3a4ead00',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100005,
            'LastComputedAt',
            'Last Computed At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f1588428-a8b2-4aa1-9718-b2ab9efbf6e0' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = '__mj_CreatedAt')) BEGIN
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
            'f1588428-a8b2-4aa1-9718-b2ab9efbf6e0',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100006,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb0bc32c-6196-41fd-8895-b3c7d2bae598' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'eb0bc32c-6196-41fd-8895-b3c7d2bae598',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100007,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '276ab7de-ae79-4fa2-bfbe-fc5361943da5' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ID')) BEGIN
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
            '276ab7de-ae79-4fa2-bfbe-fc5361943da5',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31a3dcdc-b3b8-4e4b-8a3d-5e0f77ec117a' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ContentProcessRunID')) BEGIN
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
            '31a3dcdc-b3b8-4e4b-8a3d-5e0f77ec117a',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100002,
            'ContentProcessRunID',
            'Content Process Run ID',
            'The parent pipeline run this detail belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15955547-3bf7-4dff-9cc7-4a93b9646621' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ContentSourceID')) BEGIN
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
            '15955547-3bf7-4dff-9cc7-4a93b9646621',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100003,
            'ContentSourceID',
            'Content Source ID',
            'The content source being processed in this detail record.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f50067fd-6424-4622-8f13-17ebf80b4c08' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ContentSourceTypeID')) BEGIN
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
            'f50067fd-6424-4622-8f13-17ebf80b4c08',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100004,
            'ContentSourceTypeID',
            'Content Source Type ID',
            'The type of content source (RSS Feed, Entity, Website, Cloud Storage, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b4932db4-9f18-4e5c-b517-58796f7ad33f' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'Status')) BEGIN
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
            'b4932db4-9f18-4e5c-b517-58796f7ad33f',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100005,
            'Status',
            'Status',
            'Processing status: Pending, Running, Completed, Failed, or Skipped.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e149d9ab-981f-4d11-b53e-e688d26ffc87' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ItemsProcessed')) BEGIN
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
            'e149d9ab-981f-4d11-b53e-e688d26ffc87',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100006,
            'ItemsProcessed',
            'Items Processed',
            'Total content items processed for this source during the run.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97c3def2-adf2-4ae1-986d-dbd5ddb04a8a' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ItemsTagged')) BEGIN
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
            '97c3def2-adf2-4ae1-986d-dbd5ddb04a8a',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100007,
            'ItemsTagged',
            'Items Tagged',
            'Number of content items successfully tagged by the LLM.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd72ba50-c857-493b-8155-ce5a73009a51' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ItemsVectorized')) BEGIN
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
            'fd72ba50-c857-493b-8155-ce5a73009a51',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100008,
            'ItemsVectorized',
            'Items Vectorized',
            'Number of content items successfully embedded and upserted to the vector database.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf9a81ce-0f36-4253-ac49-1c8c7d6a5974' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'TagsCreated')) BEGIN
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
            'bf9a81ce-0f36-4253-ac49-1c8c7d6a5974',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100009,
            'TagsCreated',
            'Tags Created',
            'Number of new ContentItemTag records created during LLM tagging.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38677041-dcdb-44ce-93a7-f5ecbc4e501e' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ErrorCount')) BEGIN
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
            '38677041-dcdb-44ce-93a7-f5ecbc4e501e',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100010,
            'ErrorCount',
            'Error Count',
            'Number of errors encountered while processing this source.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd468c81a-9cbc-43fb-9dbb-c8b802f3a339' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'StartTime')) BEGIN
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
            'd468c81a-9cbc-43fb-9dbb-c8b802f3a339',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100011,
            'StartTime',
            'Start Time',
            'When processing started for this source within the pipeline run.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f5b3407-5e25-44ab-91af-81384a0f4a0f' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'EndTime')) BEGIN
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
            '9f5b3407-5e25-44ab-91af-81384a0f4a0f',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100012,
            'EndTime',
            'End Time',
            'When processing completed for this source within the pipeline run.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b21adcec-e96f-4e01-b99c-22bc357dce53' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'TotalTokensUsed')) BEGIN
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
            'b21adcec-e96f-4e01-b99c-22bc357dce53',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100013,
            'TotalTokensUsed',
            'Total Tokens Used',
            'Rollup of all tokens used across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '710af907-8a83-46d4-b65c-1f3ba629adf0' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'TotalCost')) BEGIN
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
            '710af907-8a83-46d4-b65c-1f3ba629adf0',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100014,
            'TotalCost',
            'Total Cost',
            'Rollup of all costs across LLM tagging and embedding calls for this source. Computed from linked AIPromptRun records via the ContentProcessRunPromptRun junction table.',
            'decimal',
            9,
            18,
            6,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c8eb81f-825b-4029-8b5a-3d54719797d3' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = '__mj_CreatedAt')) BEGIN
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
            '0c8eb81f-825b-4029-8b5a-3d54719797d3',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100015,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a719223-f165-44f6-a08e-cef24813af94' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4a719223-f165-44f6-a08e-cef24813af94',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100016,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
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
      END

/* SQL text to insert entity field value with ID 788d5437-2b4c-4ea7-884d-075ac27bad60 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('788d5437-2b4c-4ea7-884d-075ac27bad60', '44B30122-35F7-4954-82AA-329F26486ED5', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 75b44aa0-1924-4d79-9943-c4110bfc8fb2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('75b44aa0-1924-4d79-9943-c4110bfc8fb2', '44B30122-35F7-4954-82AA-329F26486ED5', 2, 'Deleted', 'Deleted', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 29a93f14-2554-471e-8357-7c0fb9b04d69 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('29a93f14-2554-471e-8357-7c0fb9b04d69', '44B30122-35F7-4954-82AA-329F26486ED5', 3, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 690822ed-575a-4005-8e79-aca2a247d8ac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('690822ed-575a-4005-8e79-aca2a247d8ac', '44B30122-35F7-4954-82AA-329F26486ED5', 4, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 44B30122-35F7-4954-82AA-329F26486ED5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='44B30122-35F7-4954-82AA-329F26486ED5'

/* SQL text to insert entity field value with ID 57a96049-4b97-4cd4-9dfe-9c1b2fe07025 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('57a96049-4b97-4cd4-9dfe-9c1b2fe07025', '7E245D79-0054-4C21-A585-DD7D9A786C02', 1, 'Created', 'Created', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 633b8a1e-61cf-41c2-8ee5-f07563a53bb0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('633b8a1e-61cf-41c2-8ee5-f07563a53bb0', '7E245D79-0054-4C21-A585-DD7D9A786C02', 2, 'Deleted', 'Deleted', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 89d1d2dc-dc26-4d0f-85af-c6385642f510 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('89d1d2dc-dc26-4d0f-85af-c6385642f510', '7E245D79-0054-4C21-A585-DD7D9A786C02', 3, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d94c10ac-a672-4347-b871-93001a8c1cd8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d94c10ac-a672-4347-b871-93001a8c1cd8', '7E245D79-0054-4C21-A585-DD7D9A786C02', 4, 'DescriptionChanged', 'DescriptionChanged', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a6af8737-b918-480c-9961-924a4f7c96c1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a6af8737-b918-480c-9961-924a4f7c96c1', '7E245D79-0054-4C21-A585-DD7D9A786C02', 5, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID eb339994-ee89-4fdf-9985-7c352faa23cc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eb339994-ee89-4fdf-9985-7c352faa23cc', '7E245D79-0054-4C21-A585-DD7D9A786C02', 6, 'Moved', 'Moved', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 0bc81fba-2fd9-4aa2-a1d6-04568de135eb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0bc81fba-2fd9-4aa2-a1d6-04568de135eb', '7E245D79-0054-4C21-A585-DD7D9A786C02', 7, 'Reactivated', 'Reactivated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 17476c85-a9ba-47bf-893f-9e65eb4071b1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('17476c85-a9ba-47bf-893f-9e65eb4071b1', '7E245D79-0054-4C21-A585-DD7D9A786C02', 8, 'Renamed', 'Renamed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 52c00ba5-6f10-40ee-aba8-d12195d3ddfe */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('52c00ba5-6f10-40ee-aba8-d12195d3ddfe', '7E245D79-0054-4C21-A585-DD7D9A786C02', 9, 'Split', 'Split', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 7E245D79-0054-4C21-A585-DD7D9A786C02 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7E245D79-0054-4C21-A585-DD7D9A786C02'

/* SQL text to insert entity field value with ID 5753dd2a-93d7-404e-8e5a-2a9de1d935be */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5753dd2a-93d7-404e-8e5a-2a9de1d935be', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 1, 'Checksum', 'Checksum', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5dfbf9b1-a5c8-460c-ab75-3726c55742b1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5dfbf9b1-a5c8-460c-ab75-3726c55742b1', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 2, 'Title', 'Title', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 0c78ac5e-2514-400a-8924-00a54ee6e130 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0c78ac5e-2514-400a-8924-00a54ee6e130', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 3, 'URL', 'URL', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 2fa6622e-50c7-4891-ae6b-70ea833f1350 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2fa6622e-50c7-4891-ae6b-70ea833f1350', 'C50DB26E-DFB3-4175-8341-16BBE598A7E8', 4, 'Vector', 'Vector', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID C50DB26E-DFB3-4175-8341-16BBE598A7E8 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C50DB26E-DFB3-4175-8341-16BBE598A7E8'

/* SQL text to insert entity field value with ID 297a58ff-026a-4ecf-8ef2-0149d656dd29 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('297a58ff-026a-4ecf-8ef2-0149d656dd29', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 1, 'Confirmed', 'Confirmed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d47ae8ad-cb72-46d7-9ce8-1c91118878f1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d47ae8ad-cb72-46d7-9ce8-1c91118878f1', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 2, 'Dismissed', 'Dismissed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 599949d1-a4a2-44ad-84ad-7626738ee27e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('599949d1-a4a2-44ad-84ad-7626738ee27e', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 3, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ed69e575-73e6-41d7-b038-e9a383b1b97c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed69e575-73e6-41d7-b038-e9a383b1b97c', 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD', 4, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID C4BA647B-4EB5-48A8-832F-A5B02F55D4AD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C4BA647B-4EB5-48A8-832F-A5B02F55D4AD'

/* SQL text to insert entity field value with ID 93d17e97-7d78-4f8d-a72f-a48b079cf691 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('93d17e97-7d78-4f8d-a72f-a48b079cf691', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 1, 'KeepA', 'KeepA', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5aeb067c-f49b-44c2-8a4c-09f7e8b1f194 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5aeb067c-f49b-44c2-8a4c-09f7e8b1f194', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 2, 'KeepB', 'KeepB', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 1d468036-243d-43ca-a791-205f6b136329 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1d468036-243d-43ca-a791-205f6b136329', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 3, 'MergeBoth', 'MergeBoth', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 1c4dae64-f5cb-4806-aa6e-b19871fec54a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1c4dae64-f5cb-4806-aa6e-b19871fec54a', '32D4867D-F445-4578-AABB-CE5CCD2E3F2F', 4, 'NotDuplicate', 'NotDuplicate', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 32D4867D-F445-4578-AABB-CE5CCD2E3F2F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='32D4867D-F445-4578-AABB-CE5CCD2E3F2F'

/* SQL text to insert entity field value with ID 5ab34197-997f-4c3c-9854-34264a662cf4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ab34197-997f-4c3c-9854-34264a662cf4', '41209810-B679-44C8-82A1-A5A6E5057616', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d8bd4640-b599-4366-b29a-501fe8aef307 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d8bd4640-b599-4366-b29a-501fe8aef307', '41209810-B679-44C8-82A1-A5A6E5057616', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 603bfeb8-11e7-4d60-8c59-47f60af071d9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('603bfeb8-11e7-4d60-8c59-47f60af071d9', '41209810-B679-44C8-82A1-A5A6E5057616', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e34f46aa-1273-4e64-b876-322d1e3ffbd8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e34f46aa-1273-4e64-b876-322d1e3ffbd8', '41209810-B679-44C8-82A1-A5A6E5057616', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 17027ba3-78f5-43d8-a6f5-5a8cebb016b2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('17027ba3-78f5-43d8-a6f5-5a8cebb016b2', '41209810-B679-44C8-82A1-A5A6E5057616', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 41209810-B679-44C8-82A1-A5A6E5057616 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='41209810-B679-44C8-82A1-A5A6E5057616'

/* SQL text to insert entity field value with ID 36f72413-b778-4788-bc28-051bb68872a8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('36f72413-b778-4788-bc28-051bb68872a8', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 13930c72-1e2f-49e7-9e10-f01a23fd24f9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13930c72-1e2f-49e7-9e10-f01a23fd24f9', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6d46aa9c-3065-4c8d-a43f-4dea858bfcc0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6d46aa9c-3065-4c8d-a43f-4dea858bfcc0', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 4bbf5f2f-b155-48eb-a1f7-aa9c96a00e4d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4bbf5f2f-b155-48eb-a1f7-aa9c96a00e4d', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 09debec2-8403-4343-98bc-14aacfd79d17 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('09debec2-8403-4343-98bc-14aacfd79d17', '65C6E744-D91C-4D0F-84F9-16FAC676B498', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 65C6E744-D91C-4D0F-84F9-16FAC676B498 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='65C6E744-D91C-4D0F-84F9-16FAC676B498'

/* SQL text to insert entity field value with ID a05da636-3e57-4086-88be-200433d071d8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a05da636-3e57-4086-88be-200433d071d8', '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC', 1, 'Embed', 'Embed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e8bee23b-b1db-4736-b9e8-83dac2653e28 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e8bee23b-b1db-4736-b9e8-83dac2653e28', '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC', 2, 'Tag', 'Tag', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC'


/* Create Entity Relationship: MJ: Scheduled Actions -> MJ: Content Sources (One To Many via ScheduledActionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ac136b2c-5712-4a81-b161-3bee00c81d5c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ac136b2c-5712-4a81-b161-3bee00c81d5c', '12CD5A5D-A83B-EF11-86D4-0022481D1B23', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ScheduledActionID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entities -> MJ: Content Sources (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '08524788-1002-46d6-9e96-d9182fd38c39'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('08524788-1002-46d6-9e96-d9182fd38c39', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EntityID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Tag Audit Logs (One To Many via PerformedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9b80413b-10d6-4a6b-a721-e452e0132718'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9b80413b-10d6-4a6b-a721-e452e0132718', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'PerformedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Content Item Duplicates (One To Many via ResolvedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c421ef7f-e5a7-44fd-8255-1339245421fb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c421ef7f-e5a7-44fd-8255-1339245421fb', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'ResolvedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Content Process Runs (One To Many via StartedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bcb2b93b-17e9-4c13-9755-b7fbd64590ea'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bcb2b93b-17e9-4c13-9755-b7fbd64590ea', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', 'StartedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Knowledge Hub Saved Searches (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bf769ee6-b21c-45d4-abcf-ff4553cf124c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bf769ee6-b21c-45d4-abcf-ff4553cf124c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', 'UserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Models -> MJ: Content Items (One To Many via EmbeddingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7919bd24-6b33-40f0-aa1d-eed986e39f5a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7919bd24-6b33-40f0-aa1d-eed986e39f5a', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EmbeddingModelID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Tags -> MJ: Tags (One To Many via MergedIntoTagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b81e8c3a-6e69-4561-a122-cba1a098a9ab'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b81e8c3a-6e69-4561-a122-cba1a098a9ab', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'MergedIntoTagID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Co Occurrences (One To Many via TagBID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4cab35d6-87aa-4e70-8ab0-30cca85d4805'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4cab35d6-87aa-4e70-8ab0-30cca85d4805', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'TagBID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Co Occurrences (One To Many via TagAID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '22bb01d0-8eae-47cc-b7a3-9963e4c6a71e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('22bb01d0-8eae-47cc-b7a3-9963e4c6a71e', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'TagAID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Tags -> MJ: Tag Audit Logs (One To Many via RelatedTagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e8d9b9ab-6aff-4be9-a1ba-7d167c2d7a52'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e8d9b9ab-6aff-4be9-a1ba-7d167c2d7a52', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'RelatedTagID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Audit Logs (One To Many via TagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '336b7244-c104-45f3-9158-4d1bb2d3708c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('336b7244-c104-45f3-9158-4d1bb2d3708c', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'TagID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Content Item Tags (One To Many via TagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9c6f8d06-a309-473c-9d40-4bc2baa0da33'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9c6f8d06-a309-473c-9d40-4bc2baa0da33', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'TagID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Entity Record Documents -> MJ: Content Items (One To Many via EntityRecordDocumentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '80af0b4d-82e7-47c4-96a2-deebb5018ebe'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('80af0b4d-82e7-47c4-96a2-deebb5018ebe', '21248F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EntityRecordDocumentID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entity Documents -> MJ: Content Sources (One To Many via EntityDocumentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '99467f19-dba1-46ef-860c-a95744c119eb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('99467f19-dba1-46ef-860c-a95744c119eb', '22248F34-2837-EF11-86D4-6045BDEE16E6', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'EntityDocumentID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Process Runs -> MJ: Content Process Run Details (One To Many via ContentProcessRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd5eb47c4-8b0b-4360-8dd9-733de598f251'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d5eb47c4-8b0b-4360-8dd9-733de598f251', '9684A900-0E66-EF11-A752-C0A5E8ACCB22', '4A1EF567-F71F-44A3-9728-FB724062E619', 'ContentProcessRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Sources -> MJ: Content Process Run Details (One To Many via ContentSourceID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3d69087f-0f60-4cd9-8c72-5009f0382f23'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3d69087f-0f60-4cd9-8c72-5009f0382f23', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', '4A1EF567-F71F-44A3-9728-FB724062E619', 'ContentSourceID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Source Types -> MJ: Content Process Run Details (One To Many via ContentSourceTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0df1a6ee-5a1e-4205-86cc-83dfd5585223'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0df1a6ee-5a1e-4205-86cc-83dfd5585223', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', '4A1EF567-F71F-44A3-9728-FB724062E619', 'ContentSourceTypeID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Items -> MJ: Content Item Duplicates (One To Many via ContentItemAID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fa23368f-0224-47ab-8798-1dee1e3ff69c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fa23368f-0224-47ab-8798-1dee1e3ff69c', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'ContentItemAID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Content Items -> MJ: Content Item Duplicates (One To Many via ContentItemBID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0c588678-45d6-4373-8f27-34d0ca107019'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0c588678-45d6-4373-8f27-34d0ca107019', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'ContentItemBID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Prompt Runs -> MJ: Content Process Run Prompt Runs (One To Many via AIPromptRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7a6f309c-34d3-476f-9040-cf8fd592b113'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7a6f309c-34d3-476f-9040-cf8fd592b113', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'AIPromptRunID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Process Run Details -> MJ: Content Process Run Prompt Runs (One To Many via ContentProcessRunDetailID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7d2a733e-cb89-45e8-8559-5174d8c234d7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7d2a733e-cb89-45e8-8559-5174d8c234d7', '4A1EF567-F71F-44A3-9728-FB724062E619', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'ContentProcessRunDetailID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ContentItemDuplicate */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentItemAID in table ContentItemDuplicate
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ContentItemAID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemDuplicate]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ContentItemAID ON [${flyway:defaultSchema}].[ContentItemDuplicate] ([ContentItemAID]);

-- Index for foreign key ContentItemBID in table ContentItemDuplicate
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ContentItemBID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemDuplicate]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ContentItemBID ON [${flyway:defaultSchema}].[ContentItemDuplicate] ([ContentItemBID]);

-- Index for foreign key ResolvedByUserID in table ContentItemDuplicate
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ResolvedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemDuplicate]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemDuplicate_ResolvedByUserID ON [${flyway:defaultSchema}].[ContentItemDuplicate] ([ResolvedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 7D4A467C-84B7-4A3E-9BD5-B7187A656194 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7D4A467C-84B7-4A3E-9BD5-B7187A656194', @RelatedEntityNameFieldMap='ContentItemA'

/* SQL text to update entity field related entity name field map for entity field ID 617F8D8A-C680-4FD6-83CC-F87AE7B4493C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='617F8D8A-C680-4FD6-83CC-F87AE7B4493C', @RelatedEntityNameFieldMap='ContentItemB'

/* SQL text to update entity field related entity name field map for entity field ID 0CFA6CE2-0CE9-4CE9-9365-F385B4907D21 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0CFA6CE2-0CE9-4CE9-9365-F385B4907D21', @RelatedEntityNameFieldMap='ResolvedByUser'

/* Base View SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: vwContentItemDuplicates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Duplicates
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemDuplicate
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemDuplicates]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemDuplicates];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemDuplicates]
AS
SELECT
    c.*,
    MJContentItem_ContentItemAID.[Name] AS [ContentItemA],
    MJContentItem_ContentItemBID.[Name] AS [ContentItemB],
    MJUser_ResolvedByUserID.[Name] AS [ResolvedByUser]
FROM
    [${flyway:defaultSchema}].[ContentItemDuplicate] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ContentItemAID
  ON
    [c].[ContentItemAID] = MJContentItem_ContentItemAID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ContentItemBID
  ON
    [c].[ContentItemBID] = MJContentItem_ContentItemBID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ResolvedByUserID
  ON
    [c].[ResolvedByUserID] = MJUser_ResolvedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemDuplicates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: Permissions for vwContentItemDuplicates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemDuplicates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: spCreateContentItemDuplicate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemDuplicate
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemDuplicate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemDuplicate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemDuplicate]
    @ID uniqueidentifier = NULL,
    @ContentItemAID uniqueidentifier,
    @ContentItemBID uniqueidentifier,
    @SimilarityScore decimal(5, 4),
    @DetectionMethod nvarchar(30) = NULL,
    @Status nvarchar(20) = NULL,
    @ResolvedByUserID uniqueidentifier,
    @ResolvedAt datetimeoffset,
    @Resolution nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemDuplicate]
            (
                [ID],
                [ContentItemAID],
                [ContentItemBID],
                [SimilarityScore],
                [DetectionMethod],
                [Status],
                [ResolvedByUserID],
                [ResolvedAt],
                [Resolution]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentItemAID,
                @ContentItemBID,
                @SimilarityScore,
                ISNULL(@DetectionMethod, 'Checksum'),
                ISNULL(@Status, 'Pending'),
                @ResolvedByUserID,
                @ResolvedAt,
                @Resolution
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemDuplicate]
            (
                [ContentItemAID],
                [ContentItemBID],
                [SimilarityScore],
                [DetectionMethod],
                [Status],
                [ResolvedByUserID],
                [ResolvedAt],
                [Resolution]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentItemAID,
                @ContentItemBID,
                @SimilarityScore,
                ISNULL(@DetectionMethod, 'Checksum'),
                ISNULL(@Status, 'Pending'),
                @ResolvedByUserID,
                @ResolvedAt,
                @Resolution
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemDuplicates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemDuplicate] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Item Duplicates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemDuplicate] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: spUpdateContentItemDuplicate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemDuplicate
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemDuplicate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemDuplicate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemDuplicate]
    @ID uniqueidentifier,
    @ContentItemAID uniqueidentifier,
    @ContentItemBID uniqueidentifier,
    @SimilarityScore decimal(5, 4),
    @DetectionMethod nvarchar(30),
    @Status nvarchar(20),
    @ResolvedByUserID uniqueidentifier,
    @ResolvedAt datetimeoffset,
    @Resolution nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemDuplicate]
    SET
        [ContentItemAID] = @ContentItemAID,
        [ContentItemBID] = @ContentItemBID,
        [SimilarityScore] = @SimilarityScore,
        [DetectionMethod] = @DetectionMethod,
        [Status] = @Status,
        [ResolvedByUserID] = @ResolvedByUserID,
        [ResolvedAt] = @ResolvedAt,
        [Resolution] = @Resolution
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemDuplicates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemDuplicates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemDuplicate] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemDuplicate table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemDuplicate]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemDuplicate];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemDuplicate
ON [${flyway:defaultSchema}].[ContentItemDuplicate]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemDuplicate]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemDuplicate] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Item Duplicates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemDuplicate] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Item Duplicates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Duplicates
-- Item: spDeleteContentItemDuplicate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemDuplicate
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemDuplicate]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemDuplicate];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemDuplicate]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemDuplicate]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemDuplicate] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Item Duplicates */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemDuplicate] TO [cdp_Integration]



/* Index for Foreign Keys for ContentItemTag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ItemID in table ContentItemTag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemTag_ItemID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemTag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemTag_ItemID ON [${flyway:defaultSchema}].[ContentItemTag] ([ItemID]);

-- Index for foreign key TagID in table ContentItemTag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemTag_TagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemTag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemTag_TagID ON [${flyway:defaultSchema}].[ContentItemTag] ([TagID]);

/* SQL text to update entity field related entity name field map for entity field ID 5A074747-D77B-446C-8B10-204459643FF9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5A074747-D77B-446C-8B10-204459643FF9', @RelatedEntityNameFieldMap='Tag_Virtual'

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

/* SQL text to update entity field related entity name field map for entity field ID B813E21C-9A7B-4DE5-8577-7955A279CF7C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B813E21C-9A7B-4DE5-8577-7955A279CF7C', @RelatedEntityNameFieldMap='EntityRecordDocument'

/* Index for Foreign Keys for ContentProcessRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentProcessRunID in table ContentProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentProcessRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentProcessRunID ON [${flyway:defaultSchema}].[ContentProcessRunDetail] ([ContentProcessRunID]);

-- Index for foreign key ContentSourceID in table ContentProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceID ON [${flyway:defaultSchema}].[ContentProcessRunDetail] ([ContentSourceID]);

-- Index for foreign key ContentSourceTypeID in table ContentProcessRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunDetail_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentProcessRunDetail] ([ContentSourceTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 31A3DCDC-B3B8-4E4B-8A3D-5E0F77EC117A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='31A3DCDC-B3B8-4E4B-8A3D-5E0F77EC117A', @RelatedEntityNameFieldMap='ContentProcessRun'

/* Index for Foreign Keys for ContentProcessRunPromptRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentProcessRunDetailID in table ContentProcessRunPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_ContentProcessRunDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_ContentProcessRunDetailID ON [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ([ContentProcessRunDetailID]);

-- Index for foreign key AIPromptRunID in table ContentProcessRunPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_AIPromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRunPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRunPromptRun_AIPromptRunID ON [${flyway:defaultSchema}].[ContentProcessRunPromptRun] ([AIPromptRunID]);

/* SQL text to update entity field related entity name field map for entity field ID 7EB9F962-577D-4FE2-AE00-4F402CE19BFA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7EB9F962-577D-4FE2-AE00-4F402CE19BFA', @RelatedEntityNameFieldMap='AIPromptRun'

/* Index for Foreign Keys for ContentProcessRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceID in table ContentProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRun_SourceID ON [${flyway:defaultSchema}].[ContentProcessRun] ([SourceID]);

-- Index for foreign key StartedByUserID in table ContentProcessRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentProcessRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentProcessRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentProcessRun_StartedByUserID ON [${flyway:defaultSchema}].[ContentProcessRun] ([StartedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 21D1B5E7-1266-4F46-8F29-7DE40725428A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='21D1B5E7-1266-4F46-8F29-7DE40725428A', @RelatedEntityNameFieldMap='StartedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 38997A21-B71B-4A05-A8BB-68DC1CC12762 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='38997A21-B71B-4A05-A8BB-68DC1CC12762', @RelatedEntityNameFieldMap='EmbeddingModel'

/* Base View SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: vwContentItemTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Tags
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemTag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemTags]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemTags];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemTags]
AS
SELECT
    c.*,
    MJContentItem_ItemID.[Name] AS [Item],
    MJTag_TagID.[Name] AS [Tag_Virtual]
FROM
    [${flyway:defaultSchema}].[ContentItemTag] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ItemID
  ON
    [c].[ItemID] = MJContentItem_ItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagID
  ON
    [c].[TagID] = MJTag_TagID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: Permissions for vwContentItemTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spCreateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemTag]
    @ID uniqueidentifier = NULL,
    @ItemID uniqueidentifier,
    @Tag nvarchar(200),
    @Weight numeric(5, 4) = NULL,
    @TagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemTag]
            (
                [ID],
                [ItemID],
                [Tag],
                [Weight],
                [TagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ItemID,
                @Tag,
                ISNULL(@Weight, 1.0),
                @TagID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemTag]
            (
                [ItemID],
                [Tag],
                [Weight],
                [TagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ItemID,
                @Tag,
                ISNULL(@Weight, 1.0),
                @TagID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemTag] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Item Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemTag] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spUpdateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemTag]
    @ID uniqueidentifier,
    @ItemID uniqueidentifier,
    @Tag nvarchar(200),
    @Weight numeric(5, 4),
    @TagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemTag]
    SET
        [ItemID] = @ItemID,
        [Tag] = @Tag,
        [Weight] = @Weight,
        [TagID] = @TagID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemTag] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemTag table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemTag]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemTag];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemTag
ON [${flyway:defaultSchema}].[ContentItemTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemTag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemTag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Item Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemTag] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spDeleteContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemTag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemTag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemTag] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Item Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemTag] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 15955547-3BF7-4DFF-9CC7-4A93B9646621 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='15955547-3BF7-4DFF-9CC7-4A93B9646621', @RelatedEntityNameFieldMap='ContentSource'

/* Base View SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: vwContentProcessRunPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Process Run Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRunPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRunPromptRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns]
AS
SELECT
    c.*,
    MJAIPromptRun_AIPromptRunID.[RunName] AS [AIPromptRun]
FROM
    [${flyway:defaultSchema}].[ContentProcessRunPromptRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_AIPromptRunID
  ON
    [c].[AIPromptRunID] = MJAIPromptRun_AIPromptRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: Permissions for vwContentProcessRunPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: spCreateContentProcessRunPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRunPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun]
    @ID uniqueidentifier = NULL,
    @ContentProcessRunDetailID uniqueidentifier,
    @AIPromptRunID uniqueidentifier,
    @RunType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
            (
                [ID],
                [ContentProcessRunDetailID],
                [AIPromptRunID],
                [RunType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentProcessRunDetailID,
                @AIPromptRunID,
                @RunType
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
            (
                [ContentProcessRunDetailID],
                [AIPromptRunID],
                [RunType]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentProcessRunDetailID,
                @AIPromptRunID,
                @RunType
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Process Run Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: spUpdateContentProcessRunPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRunPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun]
    @ID uniqueidentifier,
    @ContentProcessRunDetailID uniqueidentifier,
    @AIPromptRunID uniqueidentifier,
    @RunType nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
    SET
        [ContentProcessRunDetailID] = @ContentProcessRunDetailID,
        [AIPromptRunID] = @AIPromptRunID,
        [RunType] = @RunType
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRunPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRunPromptRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRunPromptRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRunPromptRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRunPromptRun
ON [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Process Run Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Process Run Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Prompt Runs
-- Item: spDeleteContentProcessRunPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRunPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Process Run Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] TO [cdp_Integration]



/* Base View SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Process Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRuns]
AS
SELECT
    c.*,
    MJContentSource_SourceID.[Name] AS [Source],
    MJUser_StartedByUserID.[Name] AS [StartedByUser]
FROM
    [${flyway:defaultSchema}].[ContentProcessRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS MJContentSource_SourceID
  ON
    [c].[SourceID] = MJContentSource_SourceID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_StartedByUserID
  ON
    [c].[StartedByUserID] = MJUser_StartedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: Permissions for vwContentProcessRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: spCreateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRun]
    @ID uniqueidentifier = NULL,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int,
    @StartedByUserID uniqueidentifier,
    @TotalItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @ErrorCount int,
    @ErrorMessage nvarchar(MAX),
    @CancellationRequested bit = NULL,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [ID],
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems],
                [StartedByUserID],
                [TotalItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [ErrorCount],
                [ErrorMessage],
                [CancellationRequested],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems,
                @StartedByUserID,
                @TotalItemCount,
                @LastProcessedOffset,
                @BatchSize,
                @ErrorCount,
                @ErrorMessage,
                ISNULL(@CancellationRequested, 0),
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRun]
            (
                [SourceID],
                [StartTime],
                [EndTime],
                [Status],
                [ProcessedItems],
                [StartedByUserID],
                [TotalItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [ErrorCount],
                [ErrorMessage],
                [CancellationRequested],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceID,
                @StartTime,
                @EndTime,
                @Status,
                @ProcessedItems,
                @StartedByUserID,
                @TotalItemCount,
                @LastProcessedOffset,
                @BatchSize,
                @ErrorCount,
                @ErrorMessage,
                ISNULL(@CancellationRequested, 0),
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: spUpdateContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRun]
    @ID uniqueidentifier,
    @SourceID uniqueidentifier,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @Status nvarchar(100),
    @ProcessedItems int,
    @StartedByUserID uniqueidentifier,
    @TotalItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @ErrorCount int,
    @ErrorMessage nvarchar(MAX),
    @CancellationRequested bit,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        [SourceID] = @SourceID,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [Status] = @Status,
        [ProcessedItems] = @ProcessedItems,
        [StartedByUserID] = @StartedByUserID,
        [TotalItemCount] = @TotalItemCount,
        [LastProcessedOffset] = @LastProcessedOffset,
        [BatchSize] = @BatchSize,
        [ErrorCount] = @ErrorCount,
        [ErrorMessage] = @ErrorMessage,
        [CancellationRequested] = @CancellationRequested,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRun
ON [${flyway:defaultSchema}].[ContentProcessRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Process Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Runs
-- Item: spDeleteContentProcessRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Process Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRun] TO [cdp_Integration]



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
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel]
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
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Items
-- Item: Permissions for vwContentItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX),
    @EntityRecordDocumentID uniqueidentifier,
    @EmbeddingStatus nvarchar(20) = NULL,
    @LastEmbeddedAt datetimeoffset,
    @EmbeddingModelID uniqueidentifier,
    @TaggingStatus nvarchar(20) = NULL,
    @LastTaggedAt datetimeoffset
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
                [LastTaggedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentSourceID,
                @Name,
                @Description,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @Checksum,
                @URL,
                @Text,
                @EntityRecordDocumentID,
                ISNULL(@EmbeddingStatus, 'Pending'),
                @LastEmbeddedAt,
                @EmbeddingModelID,
                ISNULL(@TaggingStatus, 'Pending'),
                @LastTaggedAt
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
                [LastTaggedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentSourceID,
                @Name,
                @Description,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @Checksum,
                @URL,
                @Text,
                @EntityRecordDocumentID,
                ISNULL(@EmbeddingStatus, 'Pending'),
                @LastEmbeddedAt,
                @EmbeddingModelID,
                ISNULL(@TaggingStatus, 'Pending'),
                @LastTaggedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItem] TO [cdp_Developer], [cdp_Integration]



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
    @ContentSourceID uniqueidentifier,
    @Name nvarchar(250),
    @Description nvarchar(MAX),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @Checksum nvarchar(100),
    @URL nvarchar(2000),
    @Text nvarchar(MAX),
    @EntityRecordDocumentID uniqueidentifier,
    @EmbeddingStatus nvarchar(20),
    @LastEmbeddedAt datetimeoffset,
    @EmbeddingModelID uniqueidentifier,
    @TaggingStatus nvarchar(20),
    @LastTaggedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItem]
    SET
        [ContentSourceID] = @ContentSourceID,
        [Name] = @Name,
        [Description] = @Description,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [Checksum] = @Checksum,
        [URL] = @URL,
        [Text] = @Text,
        [EntityRecordDocumentID] = @EntityRecordDocumentID,
        [EmbeddingStatus] = @EmbeddingStatus,
        [LastEmbeddedAt] = @LastEmbeddedAt,
        [EmbeddingModelID] = @EmbeddingModelID,
        [TaggingStatus] = @TaggingStatus,
        [LastTaggedAt] = @LastTaggedAt
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItem] TO [cdp_Developer], [cdp_Integration]



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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItem] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID F50067FD-6424-4622-8F13-17EBF80B4C08 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F50067FD-6424-4622-8F13-17EBF80B4C08', @RelatedEntityNameFieldMap='ContentSourceType'

/* Base View SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: vwContentProcessRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Process Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentProcessRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentProcessRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentProcessRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentProcessRunDetails]
AS
SELECT
    c.*,
    MJContentProcessRun_ContentProcessRunID.[Source] AS [ContentProcessRun],
    MJContentSource_ContentSourceID.[Name] AS [ContentSource],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType]
FROM
    [${flyway:defaultSchema}].[ContentProcessRunDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[vwContentProcessRuns] AS MJContentProcessRun_ContentProcessRunID
  ON
    [c].[ContentProcessRunID] = MJContentProcessRun_ContentProcessRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS MJContentSource_ContentSourceID
  ON
    [c].[ContentSourceID] = MJContentSource_ContentSourceID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: Permissions for vwContentProcessRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentProcessRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spCreateContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunDetail]
    @ID uniqueidentifier = NULL,
    @ContentProcessRunID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @ItemsProcessed int = NULL,
    @ItemsTagged int = NULL,
    @ItemsVectorized int = NULL,
    @TagsCreated int = NULL,
    @ErrorCount int = NULL,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @TotalTokensUsed int = NULL,
    @TotalCost decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunDetail]
            (
                [ID],
                [ContentProcessRunID],
                [ContentSourceID],
                [ContentSourceTypeID],
                [Status],
                [ItemsProcessed],
                [ItemsTagged],
                [ItemsVectorized],
                [TagsCreated],
                [ErrorCount],
                [StartTime],
                [EndTime],
                [TotalTokensUsed],
                [TotalCost]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentProcessRunID,
                @ContentSourceID,
                @ContentSourceTypeID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@ItemsProcessed, 0),
                ISNULL(@ItemsTagged, 0),
                ISNULL(@ItemsVectorized, 0),
                ISNULL(@TagsCreated, 0),
                ISNULL(@ErrorCount, 0),
                @StartTime,
                @EndTime,
                ISNULL(@TotalTokensUsed, 0),
                ISNULL(@TotalCost, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunDetail]
            (
                [ContentProcessRunID],
                [ContentSourceID],
                [ContentSourceTypeID],
                [Status],
                [ItemsProcessed],
                [ItemsTagged],
                [ItemsVectorized],
                [TagsCreated],
                [ErrorCount],
                [StartTime],
                [EndTime],
                [TotalTokensUsed],
                [TotalCost]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentProcessRunID,
                @ContentSourceID,
                @ContentSourceTypeID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@ItemsProcessed, 0),
                ISNULL(@ItemsTagged, 0),
                ISNULL(@ItemsVectorized, 0),
                ISNULL(@TagsCreated, 0),
                ISNULL(@ErrorCount, 0),
                @StartTime,
                @EndTime,
                ISNULL(@TotalTokensUsed, 0),
                ISNULL(@TotalCost, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentProcessRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spUpdateContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail]
    @ID uniqueidentifier,
    @ContentProcessRunID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @Status nvarchar(20),
    @ItemsProcessed int,
    @ItemsTagged int,
    @ItemsVectorized int,
    @TagsCreated int,
    @ErrorCount int,
    @StartTime datetimeoffset,
    @EndTime datetimeoffset,
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    SET
        [ContentProcessRunID] = @ContentProcessRunID,
        [ContentSourceID] = @ContentSourceID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [Status] = @Status,
        [ItemsProcessed] = @ItemsProcessed,
        [ItemsTagged] = @ItemsTagged,
        [ItemsVectorized] = @ItemsVectorized,
        [TagsCreated] = @TagsCreated,
        [ErrorCount] = @ErrorCount,
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [TotalTokensUsed] = @TotalTokensUsed,
        [TotalCost] = @TotalCost
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentProcessRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentProcessRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRunDetail
ON [${flyway:defaultSchema}].[ContentProcessRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spDeleteContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentProcessRunDetail] TO [cdp_Integration]



/* Index for Foreign Keys for ContentSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


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

-- Index for foreign key ScheduledActionID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ScheduledActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ScheduledActionID ON [${flyway:defaultSchema}].[ContentSource] ([ScheduledActionID]);

/* SQL text to update entity field related entity name field map for entity field ID 3F8AEC67-CBBB-47BE-96C8-70795F10849C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3F8AEC67-CBBB-47BE-96C8-70795F10849C', @RelatedEntityNameFieldMap='Entity'

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
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Source Types
-- Item: Permissions for vwContentSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
    @Description nvarchar(1000),
    @DriverClass nvarchar(255),
    @Configuration nvarchar(MAX)
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
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                @Configuration
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
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSourceType] TO [cdp_Developer], [cdp_Integration]



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
    @Name nvarchar(255),
    @Description nvarchar(1000),
    @DriverClass nvarchar(255),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSourceType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [Configuration] = @Configuration
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSourceType] TO [cdp_Developer], [cdp_Integration]



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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSourceType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA', @RelatedEntityNameFieldMap='EntityDocument'

/* SQL text to update entity field related entity name field map for entity field ID 08929B56-9F28-4BB0-9F68-D783E68B8B27 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='08929B56-9F28-4BB0-9F68-D783E68B8B27', @RelatedEntityNameFieldMap='ScheduledAction'

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
    MJScheduledAction_ScheduledActionID.[Name] AS [ScheduledAction]
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
    [${flyway:defaultSchema}].[ScheduledAction] AS MJScheduledAction_ScheduledActionID
  ON
    [c].[ScheduledActionID] = MJScheduledAction_ScheduledActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @EntityID uniqueidentifier,
    @EntityDocumentID uniqueidentifier,
    @ScheduledActionID uniqueidentifier
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
                [ScheduledActionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration,
                @EntityID,
                @EntityDocumentID,
                @ScheduledActionID
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
                [ScheduledActionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration,
                @EntityID,
                @EntityDocumentID,
                @ScheduledActionID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration]



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
    @Name nvarchar(255),
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @EntityID uniqueidentifier,
    @EntityDocumentID uniqueidentifier,
    @ScheduledActionID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        [Name] = @Name,
        [ContentTypeID] = @ContentTypeID,
        [ContentSourceTypeID] = @ContentSourceTypeID,
        [ContentFileTypeID] = @ContentFileTypeID,
        [URL] = @URL,
        [EmbeddingModelID] = @EmbeddingModelID,
        [VectorIndexID] = @VectorIndexID,
        [Configuration] = @Configuration,
        [EntityID] = @EntityID,
        [EntityDocumentID] = @EntityDocumentID,
        [ScheduledActionID] = @ScheduledActionID
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]



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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Integration]



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
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Content Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Types
-- Item: Permissions for vwContentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int,
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX)
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
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @AIModelID,
                @MinTags,
                @MaxTags,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration
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
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @AIModelID,
                @MinTags,
                @MaxTags,
                @EmbeddingModelID,
                @VectorIndexID,
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentType] TO [cdp_Developer], [cdp_Integration]



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
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @AIModelID uniqueidentifier,
    @MinTags int,
    @MaxTags int,
    @EmbeddingModelID uniqueidentifier,
    @VectorIndexID uniqueidentifier,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [AIModelID] = @AIModelID,
        [MinTags] = @MinTags,
        [MaxTags] = @MaxTags,
        [EmbeddingModelID] = @EmbeddingModelID,
        [VectorIndexID] = @VectorIndexID,
        [Configuration] = @Configuration
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentType] TO [cdp_Developer], [cdp_Integration]



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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Content Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentType] TO [cdp_Integration]



/* Index for Foreign Keys for DuplicateRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DuplicateRunID in table DuplicateRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID ON [${flyway:defaultSchema}].[DuplicateRunDetail] ([DuplicateRunID]);

/* Index for Foreign Keys for DuplicateRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID ON [${flyway:defaultSchema}].[DuplicateRun] ([EntityID]);

-- Index for foreign key StartedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([StartedByUserID]);

-- Index for foreign key SourceListID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID ON [${flyway:defaultSchema}].[DuplicateRun] ([SourceListID]);

-- Index for foreign key ApprovedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([ApprovedByUserID]);

/* Base View SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetails]
AS
SELECT
    d.*,
    MJDuplicateRun_DuplicateRunID.[Entity] AS [DuplicateRun]
FROM
    [${flyway:defaultSchema}].[DuplicateRunDetail] AS d
INNER JOIN
    [${flyway:defaultSchema}].[vwDuplicateRuns] AS MJDuplicateRun_DuplicateRunID
  ON
    [d].[DuplicateRunID] = MJDuplicateRun_DuplicateRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Permissions for vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spCreateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetail]
    @ID uniqueidentifier = NULL,
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20) = NULL,
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20) = NULL,
    @MergeErrorMessage nvarchar(MAX),
    @RecordMetadata nvarchar(MAX),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetail]
            (
                [ID],
                [DuplicateRunID],
                [RecordID],
                [MatchStatus],
                [SkippedReason],
                [MatchErrorMessage],
                [MergeStatus],
                [MergeErrorMessage],
                [RecordMetadata],
                [StartedAt],
                [EndedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DuplicateRunID,
                @RecordID,
                ISNULL(@MatchStatus, 'Pending'),
                @SkippedReason,
                @MatchErrorMessage,
                ISNULL(@MergeStatus, 'Not Applicable'),
                @MergeErrorMessage,
                @RecordMetadata,
                @StartedAt,
                @EndedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetail]
            (
                [DuplicateRunID],
                [RecordID],
                [MatchStatus],
                [SkippedReason],
                [MatchErrorMessage],
                [MergeStatus],
                [MergeErrorMessage],
                [RecordMetadata],
                [StartedAt],
                [EndedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DuplicateRunID,
                @RecordID,
                ISNULL(@MatchStatus, 'Pending'),
                @SkippedReason,
                @MatchErrorMessage,
                ISNULL(@MergeStatus, 'Not Applicable'),
                @MergeErrorMessage,
                @RecordMetadata,
                @StartedAt,
                @EndedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spUpdateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail]
    @ID uniqueidentifier,
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20),
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20),
    @MergeErrorMessage nvarchar(MAX),
    @RecordMetadata nvarchar(MAX),
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    SET
        [DuplicateRunID] = @DuplicateRunID,
        [RecordID] = @RecordID,
        [MatchStatus] = @MatchStatus,
        [SkippedReason] = @SkippedReason,
        [MatchErrorMessage] = @MatchErrorMessage,
        [MergeStatus] = @MergeStatus,
        [MergeErrorMessage] = @MergeErrorMessage,
        [RecordMetadata] = @RecordMetadata,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRunDetail
ON [${flyway:defaultSchema}].[DuplicateRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRuns]
AS
SELECT
    d.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_StartedByUserID.[Name] AS [StartedByUser],
    MJList_SourceListID.[Name] AS [SourceList],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser]
FROM
    [${flyway:defaultSchema}].[DuplicateRun] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [d].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_StartedByUserID
  ON
    [d].[StartedByUserID] = MJUser_StartedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[List] AS MJList_SourceListID
  ON
    [d].[SourceListID] = MJList_SourceListID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* Base View Permissions SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spCreateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20) = NULL,
    @ProcessingErrorMessage nvarchar(MAX),
    @TotalItemCount int,
    @ProcessedItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @CancellationRequested bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [ID],
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage],
                [TotalItemCount],
                [ProcessedItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [CancellationRequested]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage,
                @TotalItemCount,
                @ProcessedItemCount,
                @LastProcessedOffset,
                @BatchSize,
                ISNULL(@CancellationRequested, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage],
                [TotalItemCount],
                [ProcessedItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [CancellationRequested]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @StartedByUserID,
                @SourceListID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @EndedAt,
                ISNULL(@ApprovalStatus, 'Pending'),
                @ApprovalComments,
                @ApprovedByUserID,
                ISNULL(@ProcessingStatus, 'Pending'),
                @ProcessingErrorMessage,
                @TotalItemCount,
                @ProcessedItemCount,
                @LastProcessedOffset,
                @BatchSize,
                ISNULL(@CancellationRequested, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spUpdateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID uniqueidentifier,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX),
    @TotalItemCount int,
    @ProcessedItemCount int,
    @LastProcessedOffset int,
    @BatchSize int,
    @CancellationRequested bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        [EntityID] = @EntityID,
        [StartedByUserID] = @StartedByUserID,
        [SourceListID] = @SourceListID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovalComments] = @ApprovalComments,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingErrorMessage] = @ProcessingErrorMessage,
        [TotalItemCount] = @TotalItemCount,
        [ProcessedItemCount] = @ProcessedItemCount,
        [LastProcessedOffset] = @LastProcessedOffset,
        [BatchSize] = @BatchSize,
        [CancellationRequested] = @CancellationRequested
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRun
ON [${flyway:defaultSchema}].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spDeleteDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail] TO [cdp_Integration]



/* spDelete SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spDeleteDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Duplicate Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Integration]



/* Index for Foreign Keys for KnowledgeHubSavedSearch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table KnowledgeHubSavedSearch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_KnowledgeHubSavedSearch_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[KnowledgeHubSavedSearch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_KnowledgeHubSavedSearch_UserID ON [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID EB748BE8-F23A-4D4D-876E-F892973FBE00 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EB748BE8-F23A-4D4D-876E-F892973FBE00', @RelatedEntityNameFieldMap='User'

/* Base View SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: vwKnowledgeHubSavedSearches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Knowledge Hub Saved Searches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  KnowledgeHubSavedSearch
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches]
AS
SELECT
    k.*,
    MJUser_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] AS k
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [k].[UserID] = MJUser_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: Permissions for vwKnowledgeHubSavedSearches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: spCreateKnowledgeHubSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR KnowledgeHubSavedSearch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateKnowledgeHubSavedSearch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateKnowledgeHubSavedSearch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateKnowledgeHubSavedSearch]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Name nvarchar(255),
    @Query nvarchar(1000),
    @Filters nvarchar(MAX),
    @MinScore decimal(3, 2),
    @MaxResults int,
    @NotifyOnNewResults bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[KnowledgeHubSavedSearch]
            (
                [ID],
                [UserID],
                [Name],
                [Query],
                [Filters],
                [MinScore],
                [MaxResults],
                [NotifyOnNewResults]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Name,
                @Query,
                @Filters,
                @MinScore,
                @MaxResults,
                ISNULL(@NotifyOnNewResults, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[KnowledgeHubSavedSearch]
            (
                [UserID],
                [Name],
                [Query],
                [Filters],
                [MinScore],
                [MaxResults],
                [NotifyOnNewResults]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Name,
                @Query,
                @Filters,
                @MinScore,
                @MaxResults,
                ISNULL(@NotifyOnNewResults, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateKnowledgeHubSavedSearch] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Knowledge Hub Saved Searches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateKnowledgeHubSavedSearch] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: spUpdateKnowledgeHubSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR KnowledgeHubSavedSearch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateKnowledgeHubSavedSearch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateKnowledgeHubSavedSearch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateKnowledgeHubSavedSearch]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Name nvarchar(255),
    @Query nvarchar(1000),
    @Filters nvarchar(MAX),
    @MinScore decimal(3, 2),
    @MaxResults int,
    @NotifyOnNewResults bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[KnowledgeHubSavedSearch]
    SET
        [UserID] = @UserID,
        [Name] = @Name,
        [Query] = @Query,
        [Filters] = @Filters,
        [MinScore] = @MinScore,
        [MaxResults] = @MaxResults,
        [NotifyOnNewResults] = @NotifyOnNewResults
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwKnowledgeHubSavedSearches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateKnowledgeHubSavedSearch] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the KnowledgeHubSavedSearch table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateKnowledgeHubSavedSearch]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateKnowledgeHubSavedSearch];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateKnowledgeHubSavedSearch
ON [${flyway:defaultSchema}].[KnowledgeHubSavedSearch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[KnowledgeHubSavedSearch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Knowledge Hub Saved Searches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateKnowledgeHubSavedSearch] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Knowledge Hub Saved Searches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Knowledge Hub Saved Searches
-- Item: spDeleteKnowledgeHubSavedSearch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR KnowledgeHubSavedSearch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteKnowledgeHubSavedSearch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteKnowledgeHubSavedSearch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteKnowledgeHubSavedSearch]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[KnowledgeHubSavedSearch]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteKnowledgeHubSavedSearch] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Knowledge Hub Saved Searches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteKnowledgeHubSavedSearch] TO [cdp_Integration]



/* Index for Foreign Keys for TagAuditLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TagID in table TagAuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagAuditLog_TagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagAuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagAuditLog_TagID ON [${flyway:defaultSchema}].[TagAuditLog] ([TagID]);

-- Index for foreign key PerformedByUserID in table TagAuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagAuditLog_PerformedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagAuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagAuditLog_PerformedByUserID ON [${flyway:defaultSchema}].[TagAuditLog] ([PerformedByUserID]);

-- Index for foreign key RelatedTagID in table TagAuditLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagAuditLog_RelatedTagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagAuditLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagAuditLog_RelatedTagID ON [${flyway:defaultSchema}].[TagAuditLog] ([RelatedTagID]);

/* SQL text to update entity field related entity name field map for entity field ID 46CD46EA-A20B-4A44-AF88-083AAB58D441 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='46CD46EA-A20B-4A44-AF88-083AAB58D441', @RelatedEntityNameFieldMap='Tag'

/* Index for Foreign Keys for TagCoOccurrence */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TagAID in table TagCoOccurrence
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagCoOccurrence_TagAID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagCoOccurrence]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagCoOccurrence_TagAID ON [${flyway:defaultSchema}].[TagCoOccurrence] ([TagAID]);

-- Index for foreign key TagBID in table TagCoOccurrence
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagCoOccurrence_TagBID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagCoOccurrence]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagCoOccurrence_TagBID ON [${flyway:defaultSchema}].[TagCoOccurrence] ([TagBID]);

/* SQL text to update entity field related entity name field map for entity field ID 6D039B78-F386-439A-A952-240FD964A9CE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6D039B78-F386-439A-A952-240FD964A9CE', @RelatedEntityNameFieldMap='TagA'

/* Index for Foreign Keys for TaggedItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TagID in table TaggedItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaggedItem_TagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaggedItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaggedItem_TagID ON [${flyway:defaultSchema}].[TaggedItem] ([TagID]);

-- Index for foreign key EntityID in table TaggedItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TaggedItem_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TaggedItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TaggedItem_EntityID ON [${flyway:defaultSchema}].[TaggedItem] ([EntityID]);

/* Index for Foreign Keys for Tag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Tag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Tag_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Tag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Tag_ParentID ON [${flyway:defaultSchema}].[Tag] ([ParentID]);

-- Index for foreign key MergedIntoTagID in table Tag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Tag_MergedIntoTagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Tag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Tag_MergedIntoTagID ON [${flyway:defaultSchema}].[Tag] ([MergedIntoTagID]);

/* SQL text to update entity field related entity name field map for entity field ID 23E00FA1-C0B5-4370-B526-78F65F2571D2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='23E00FA1-C0B5-4370-B526-78F65F2571D2', @RelatedEntityNameFieldMap='MergedIntoTag'

/* Base View SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: vwTaggedItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tagged Items
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TaggedItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTaggedItems]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTaggedItems];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTaggedItems]
AS
SELECT
    t.*,
    MJTag_TagID.[Name] AS [Tag],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[TaggedItem] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagID
  ON
    [t].[TagID] = MJTag_TagID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [t].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTaggedItems] TO [cdp_UI]

/* Base View Permissions SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: Permissions for vwTaggedItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTaggedItems] TO [cdp_UI]

/* spCreate SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spCreateTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaggedItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTaggedItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTaggedItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTaggedItem]
    @ID uniqueidentifier = NULL,
    @TagID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Weight numeric(5, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TaggedItem]
            (
                [ID],
                [TagID],
                [EntityID],
                [RecordID],
                [Weight]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TagID,
                @EntityID,
                @RecordID,
                ISNULL(@Weight, 1.0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TaggedItem]
            (
                [TagID],
                [EntityID],
                [RecordID],
                [Weight]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TagID,
                @EntityID,
                @RecordID,
                ISNULL(@Weight, 1.0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTaggedItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaggedItem] TO [cdp_UI]
    

/* spCreate Permissions for MJ: Tagged Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTaggedItem] TO [cdp_UI]



/* spUpdate SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spUpdateTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaggedItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTaggedItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTaggedItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTaggedItem]
    @ID uniqueidentifier,
    @TagID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Weight numeric(5, 4)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaggedItem]
    SET
        [TagID] = @TagID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [Weight] = @Weight
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTaggedItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTaggedItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaggedItem] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TaggedItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTaggedItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTaggedItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTaggedItem
ON [${flyway:defaultSchema}].[TaggedItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TaggedItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TaggedItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tagged Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTaggedItem] TO [cdp_UI]



/* spDelete SQL for MJ: Tagged Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tagged Items
-- Item: spDeleteTaggedItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaggedItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTaggedItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTaggedItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTaggedItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TaggedItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaggedItem] TO [cdp_UI]
    

/* spDelete Permissions for MJ: Tagged Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTaggedItem] TO [cdp_UI]



/* Root ID Function SQL for MJ: Tags.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: fnTagParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Tag].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnTagParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnTagParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnTagParentID_GetRootID]
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
            [${flyway:defaultSchema}].[Tag]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Tag] c
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


/* Root ID Function SQL for MJ: Tags.MergedIntoTagID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: fnTagMergedIntoTagID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Tag].[MergedIntoTagID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnTagMergedIntoTagID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnTagMergedIntoTagID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnTagMergedIntoTagID_GetRootID]
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
            [MergedIntoTagID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Tag]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[MergedIntoTagID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[Tag] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[MergedIntoTagID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [MergedIntoTagID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* Base View SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: vwTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tags
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Tag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTags]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTags];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTags]
AS
SELECT
    t.*,
    MJTag_ParentID.[Name] AS [Parent],
    MJTag_MergedIntoTagID.[Name] AS [MergedIntoTag],
    root_ParentID.RootID AS [RootParentID],
    root_MergedIntoTagID.RootID AS [RootMergedIntoTagID]
FROM
    [${flyway:defaultSchema}].[Tag] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_ParentID
  ON
    [t].[ParentID] = MJTag_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_MergedIntoTagID
  ON
    [t].[MergedIntoTagID] = MJTag_MergedIntoTagID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnTagParentID_GetRootID]([t].[ID], [t].[ParentID]) AS root_ParentID
OUTER APPLY
    [${flyway:defaultSchema}].[fnTagMergedIntoTagID_GetRootID]([t].[ID], [t].[MergedIntoTagID]) AS root_MergedIntoTagID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTags] TO [cdp_UI]

/* Base View Permissions SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: Permissions for vwTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTags] TO [cdp_UI]

/* spCreate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spCreateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTag]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @MergedIntoTagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Tag]
            (
                [ID],
                [Name],
                [ParentID],
                [DisplayName],
                [Description],
                [Status],
                [MergedIntoTagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentID,
                @DisplayName,
                @Description,
                ISNULL(@Status, 'Active'),
                @MergedIntoTagID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Tag]
            (
                [Name],
                [ParentID],
                [DisplayName],
                [Description],
                [Status],
                [MergedIntoTagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID,
                @DisplayName,
                @Description,
                ISNULL(@Status, 'Active'),
                @MergedIntoTagID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTag] TO [cdp_UI]
    

/* spCreate Permissions for MJ: Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTag] TO [cdp_UI]



/* spUpdate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spUpdateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTag]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @MergedIntoTagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Tag]
    SET
        [Name] = @Name,
        [ParentID] = @ParentID,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [Status] = @Status,
        [MergedIntoTagID] = @MergedIntoTagID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTag] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tag table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTag]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTag];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTag
ON [${flyway:defaultSchema}].[Tag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Tag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Tag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTag] TO [cdp_UI]



/* spDelete SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spDeleteTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Tag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTag] TO [cdp_UI]
    

/* spDelete Permissions for MJ: Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTag] TO [cdp_UI]



/* SQL text to update entity field related entity name field map for entity field ID 5F9C0FD7-6F54-4155-94B8-DD71D886D200 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5F9C0FD7-6F54-4155-94B8-DD71D886D200', @RelatedEntityNameFieldMap='PerformedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 37EB7CDB-4E0A-48D2-BBB5-D84F61847DF9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='37EB7CDB-4E0A-48D2-BBB5-D84F61847DF9', @RelatedEntityNameFieldMap='TagB'

/* SQL text to update entity field related entity name field map for entity field ID 1D390D4F-8CCA-478A-B7D0-6086BEC11C67 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1D390D4F-8CCA-478A-B7D0-6086BEC11C67', @RelatedEntityNameFieldMap='RelatedTag'

/* Base View SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: vwTagCoOccurrences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tag Co Occurrences
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TagCoOccurrence
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTagCoOccurrences]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTagCoOccurrences];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTagCoOccurrences]
AS
SELECT
    t.*,
    MJTag_TagAID.[Name] AS [TagA],
    MJTag_TagBID.[Name] AS [TagB]
FROM
    [${flyway:defaultSchema}].[TagCoOccurrence] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagAID
  ON
    [t].[TagAID] = MJTag_TagAID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagBID
  ON
    [t].[TagBID] = MJTag_TagBID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTagCoOccurrences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: Permissions for vwTagCoOccurrences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTagCoOccurrences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: spCreateTagCoOccurrence
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagCoOccurrence
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTagCoOccurrence]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTagCoOccurrence];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTagCoOccurrence]
    @ID uniqueidentifier = NULL,
    @TagAID uniqueidentifier,
    @TagBID uniqueidentifier,
    @CoOccurrenceCount int = NULL,
    @LastComputedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TagCoOccurrence]
            (
                [ID],
                [TagAID],
                [TagBID],
                [CoOccurrenceCount],
                [LastComputedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TagAID,
                @TagBID,
                ISNULL(@CoOccurrenceCount, 0),
                ISNULL(@LastComputedAt, getutcdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TagCoOccurrence]
            (
                [TagAID],
                [TagBID],
                [CoOccurrenceCount],
                [LastComputedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TagAID,
                @TagBID,
                ISNULL(@CoOccurrenceCount, 0),
                ISNULL(@LastComputedAt, getutcdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTagCoOccurrences] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagCoOccurrence] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tag Co Occurrences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagCoOccurrence] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: spUpdateTagCoOccurrence
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagCoOccurrence
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTagCoOccurrence]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTagCoOccurrence];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTagCoOccurrence]
    @ID uniqueidentifier,
    @TagAID uniqueidentifier,
    @TagBID uniqueidentifier,
    @CoOccurrenceCount int,
    @LastComputedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagCoOccurrence]
    SET
        [TagAID] = @TagAID,
        [TagBID] = @TagBID,
        [CoOccurrenceCount] = @CoOccurrenceCount,
        [LastComputedAt] = @LastComputedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTagCoOccurrences] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTagCoOccurrences]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagCoOccurrence] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TagCoOccurrence table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTagCoOccurrence]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTagCoOccurrence];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTagCoOccurrence
ON [${flyway:defaultSchema}].[TagCoOccurrence]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagCoOccurrence]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TagCoOccurrence] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tag Co Occurrences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagCoOccurrence] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tag Co Occurrences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Co Occurrences
-- Item: spDeleteTagCoOccurrence
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagCoOccurrence
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTagCoOccurrence]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTagCoOccurrence];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTagCoOccurrence]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TagCoOccurrence]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagCoOccurrence] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tag Co Occurrences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagCoOccurrence] TO [cdp_Integration]



/* Base View SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: vwTagAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tag Audit Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TagAuditLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTagAuditLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTagAuditLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTagAuditLogs]
AS
SELECT
    t.*,
    MJTag_TagID.[Name] AS [Tag],
    MJUser_PerformedByUserID.[Name] AS [PerformedByUser],
    MJTag_RelatedTagID.[Name] AS [RelatedTag]
FROM
    [${flyway:defaultSchema}].[TagAuditLog] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagID
  ON
    [t].[TagID] = MJTag_TagID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_PerformedByUserID
  ON
    [t].[PerformedByUserID] = MJUser_PerformedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_RelatedTagID
  ON
    [t].[RelatedTagID] = MJTag_RelatedTagID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTagAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: Permissions for vwTagAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTagAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: spCreateTagAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTagAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTagAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTagAuditLog]
    @ID uniqueidentifier = NULL,
    @TagID uniqueidentifier,
    @Action nvarchar(30),
    @Details nvarchar(MAX),
    @PerformedByUserID uniqueidentifier,
    @RelatedTagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TagAuditLog]
            (
                [ID],
                [TagID],
                [Action],
                [Details],
                [PerformedByUserID],
                [RelatedTagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TagID,
                @Action,
                @Details,
                @PerformedByUserID,
                @RelatedTagID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TagAuditLog]
            (
                [TagID],
                [Action],
                [Details],
                [PerformedByUserID],
                [RelatedTagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TagID,
                @Action,
                @Details,
                @PerformedByUserID,
                @RelatedTagID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTagAuditLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagAuditLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tag Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagAuditLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: spUpdateTagAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTagAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTagAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTagAuditLog]
    @ID uniqueidentifier,
    @TagID uniqueidentifier,
    @Action nvarchar(30),
    @Details nvarchar(MAX),
    @PerformedByUserID uniqueidentifier,
    @RelatedTagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagAuditLog]
    SET
        [TagID] = @TagID,
        [Action] = @Action,
        [Details] = @Details,
        [PerformedByUserID] = @PerformedByUserID,
        [RelatedTagID] = @RelatedTagID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTagAuditLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTagAuditLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagAuditLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TagAuditLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTagAuditLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTagAuditLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTagAuditLog
ON [${flyway:defaultSchema}].[TagAuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagAuditLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TagAuditLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tag Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagAuditLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tag Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Audit Logs
-- Item: spDeleteTagAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTagAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTagAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTagAuditLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TagAuditLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagAuditLog] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tag Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagAuditLog] TO [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AssistantPrefill nvarchar(MAX)
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ParentID_AgentRunID, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill nvarchar(MAX)
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun
    DECLARE @MJContentProcessRunPromptRuns_AIPromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
        WHERE [AIPromptRunID] = @ID
    
    OPEN cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] @ID = @MJContentProcessRunPromptRuns_AIPromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    END
    
    CLOSE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    DEALLOCATE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9888e302-447e-472a-a907-0f77dd49b1d7' OR (EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA' AND Name = 'User')) BEGIN
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
            '9888e302-447e-472a-a907-0f77dd49b1d7',
            'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', -- Entity: MJ: Knowledge Hub Saved Searches
            100021,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd942b17-cf54-41c5-b8b3-6a66bac2c41e' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MergedIntoTag')) BEGIN
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
            'fd942b17-cf54-41c5-b8b3-6a66bac2c41e',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100022,
            'MergedIntoTag',
            'Merged Into Tag',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd47c8e2a-aaac-4c4d-992e-f595dc94877c' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootMergedIntoTagID')) BEGIN
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
            'd47c8e2a-aaac-4c4d-992e-f595dc94877c',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100024,
            'RootMergedIntoTagID',
            'Root Merged Into Tag ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f71ef762-c453-46c7-b254-fe5599a6bccc' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ContentItemA')) BEGIN
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
            'f71ef762-c453-46c7-b254-fe5599a6bccc',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100023,
            'ContentItemA',
            'Content Item A',
            NULL,
            'nvarchar',
            500,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a02b47f0-c3ae-432c-878b-29e318927e8b' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ContentItemB')) BEGIN
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
            'a02b47f0-c3ae-432c-878b-29e318927e8b',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100024,
            'ContentItemB',
            'Content Item B',
            NULL,
            'nvarchar',
            500,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '855e4e16-ca8d-400b-ad90-eb9da34f88c9' OR (EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5' AND Name = 'ResolvedByUser')) BEGIN
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
            '855e4e16-ca8d-400b-ad90-eb9da34f88c9',
            '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', -- Entity: MJ: Content Item Duplicates
            100025,
            'ResolvedByUser',
            'Resolved By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8771ec60-34b8-4b40-8dcc-0300371ec591' OR (EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15' AND Name = 'AIPromptRun')) BEGIN
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
            '8771ec60-34b8-4b40-8dcc-0300371ec591',
            '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', -- Entity: MJ: Content Process Run Prompt Runs
            100013,
            'AIPromptRun',
            'AI Prompt Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a894d304-a15c-44c3-a8ea-add024a01f8c' OR (EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'StartedByUser')) BEGIN
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
            'a894d304-a15c-44c3-a8ea-add024a01f8c',
            '9684A900-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Process Runs
            100035,
            'StartedByUser',
            'Started By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e446a7b9-8f1c-47a4-8fba-53ff05049f2c' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Entity')) BEGIN
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
            'e446a7b9-8f1c-47a4-8fba-53ff05049f2c',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100039,
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '715bceb6-0b7d-49cb-ac91-3af520ef90d9' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityDocument')) BEGIN
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
            '715bceb6-0b7d-49cb-ac91-3af520ef90d9',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100040,
            'EntityDocument',
            'Entity Document',
            NULL,
            'nvarchar',
            500,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70fcde3c-bd64-496c-8830-4c4d3786a5d6' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ScheduledAction')) BEGIN
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
            '70fcde3c-bd64-496c-8830-4c4d3786a5d6',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100041,
            'ScheduledAction',
            'Scheduled Action',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '19ece70f-743d-482e-a487-7795c4946954' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EntityRecordDocument')) BEGIN
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
            '19ece70f-743d-482e-a487-7795c4946954',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100045,
            'EntityRecordDocument',
            'Entity Record Document',
            NULL,
            'nvarchar',
            900,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '142e32d6-e2c2-4ec7-89b1-ae9ee4485993' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModel')) BEGIN
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
            '142e32d6-e2c2-4ec7-89b1-ae9ee4485993',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100046,
            'EmbeddingModel',
            'Embedding Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '02a46354-0433-4ccf-abf3-9478711d2c5b' OR (EntityID = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Tag_Virtual')) BEGIN
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
            '02a46354-0433-4ccf-abf3-9478711d2c5b',
            'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Item Tags
            100017,
            'Tag_Virtual',
            'Tag Virtual',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b932150b-d06e-4b7a-887c-63e686fd5eca' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'Tag')) BEGIN
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
            'b932150b-d06e-4b7a-887c-63e686fd5eca',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100017,
            'Tag',
            'Tag',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c62a127-1d05-485d-a736-125c10b812ab' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'PerformedByUser')) BEGIN
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
            '1c62a127-1d05-485d-a736-125c10b812ab',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100018,
            'PerformedByUser',
            'Performed By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c659fc6-bc31-4fcf-be84-b409f9a442c7' OR (EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84' AND Name = 'RelatedTag')) BEGIN
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
            '6c659fc6-bc31-4fcf-be84-b409f9a442c7',
            '30CB615E-D556-46DE-9E15-CED108FCEE84', -- Entity: MJ: Tag Audit Logs
            100019,
            'RelatedTag',
            'Related Tag',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f1ba3be-62ef-4c78-a8af-9505e4dd2f81' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = 'TagA')) BEGIN
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
            '5f1ba3be-62ef-4c78-a8af-9505e4dd2f81',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100015,
            'TagA',
            'Tag A',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b87da36-8226-4cf5-96f7-211a16c7bef9' OR (EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571' AND Name = 'TagB')) BEGIN
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
            '1b87da36-8226-4cf5-96f7-211a16c7bef9',
            'C353DB72-DE7C-4674-98D0-D4DDB9D41571', -- Entity: MJ: Tag Co Occurrences
            100016,
            'TagB',
            'Tag B',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '868f5319-6ddc-4302-be53-dd0ab3dfa7ef' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ContentProcessRun')) BEGIN
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
            '868f5319-6ddc-4302-be53-dd0ab3dfa7ef',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100033,
            'ContentProcessRun',
            'Content Process Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08c081ef-64ec-4def-bd92-391918cc0229' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ContentSource')) BEGIN
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
            '08c081ef-64ec-4def-bd92-391918cc0229',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100034,
            'ContentSource',
            'Content Source',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d07f4e6-1501-482b-a394-514855e3912b' OR (EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619' AND Name = 'ContentSourceType')) BEGIN
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
            '6d07f4e6-1501-482b-a394-514855e3912b',
            '4A1EF567-F71F-44A3-9728-FB724062E619', -- Entity: MJ: Content Process Run Details
            100035,
            'ContentSourceType',
            'Content Source Type',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '02A46354-0433-4CCF-ABF3-9478711D2C5B'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '02A46354-0433-4CCF-ABF3-9478711D2C5B'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '798CBA36-02E7-467E-AEC9-88737953B466'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8771EC60-34B8-4B40-8DCC-0300371EC591'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '8771EC60-34B8-4B40-8DCC-0300371EC591'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B4932DB4-9F18-4E5C-B517-58796F7AD33F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E149D9AB-981F-4D11-B53E-E688D26FFC87'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '38677041-DCDB-44CE-93A7-F5ECBC4E501E'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D468C81A-9CBC-43FB-9DBB-C8B802F3A339'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '710AF907-8A83-46D4-B65C-1F3BA629ADF0'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '868F5319-6DDC-4302-BE53-DD0AB3DFA7EF'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '08C081EF-64EC-4DEF-BD92-391918CC0229'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B4932DB4-9F18-4E5C-B517-58796F7AD33F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '868F5319-6DDC-4302-BE53-DD0AB3DFA7EF'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '08C081EF-64EC-4DEF-BD92-391918CC0229'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '6D07F4E6-1501-482B-A394-514855E3912B'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DD9010D3-5655-4437-8479-D697EED29E74'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C50DB26E-DFB3-4175-8341-16BBE598A7E8'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F71EF762-C453-46C7-B254-FE5599A6BCCC'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A02B47F0-C3AE-432C-878B-29E318927E8B'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C50DB26E-DFB3-4175-8341-16BBE598A7E8'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '32D4867D-F445-4578-AABB-CE5CCD2E3F2F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'F71EF762-C453-46C7-B254-FE5599A6BCCC'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A02B47F0-C3AE-432C-878B-29E318927E8B'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '855E4E16-CA8D-400B-AD90-EB9DA34F88C9'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F7B8433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '41209810-B679-44C8-82A1-A5A6E5057616'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '65C6E744-D91C-4D0F-84F9-16FAC676B498'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CDB8433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'EBB8433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0BD076E0-A5D2-4AF8-B9A7-646D342DBEF4'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '064AA602-A3D4-4192-88C4-6F96EFDF0F18'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E13CB38F-1FB7-439C-A962-ED7F91DE0BFF'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 24 fields */

-- UPDATE Entity Field Category Info MJ: Content Items.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BBB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BD076E0-A5D2-4AF8-B9A7-646D342DBEF4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D9B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFA43D7E-C671-48A6-8733-8B75CA8B3CC1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentFileTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E13CB38F-1FB7-439C-A962-ED7F91DE0BFF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.URL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'EBB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Checksum 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EntityRecordDocumentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B813E21C-9A7B-4DE5-8577-7955A279CF7C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EntityRecordDocument 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19ECE70F-743D-482E-A487-7795C4946954' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CDB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '064AA602-A3D4-4192-88C4-6F96EFDF0F18' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Text 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Content Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EmbeddingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41209810-B679-44C8-82A1-A5A6E5057616' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.LastEmbeddedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6331B8CE-6FBA-4095-B65D-8F647C494A19' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38997A21-B71B-4A05-A8BB-68DC1CC12762' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '142E32D6-E2C2-4EC7-89B1-AE9EE4485993' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.TaggingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65C6E744-D91C-4D0F-84F9-16FAC676B498' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.LastTaggedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI & Vectorization',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC13EE1E-7485-4DB3-AF95-1014C36EE9D2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FDB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d759a2ff-83d2-4f17-af70-99775b626848', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"AI & Vectorization":{"icon":"fa fa-robot","description":"Status and metadata for AI processing, including vector embeddings and automated tagging."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"AI & Vectorization":"fa fa-robot","System Metadata":"fa fa-cog"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6384381-DD5E-4454-9CC6-120896AE4688' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemAID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comparison Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Item A ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D4A467C-84B7-4A3E-9BD5-B7187A656194' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemA 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comparison Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F71EF762-C453-46C7-B254-FE5599A6BCCC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemBID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comparison Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Item B ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '617F8D8A-C680-4FD6-83CC-F87AE7B4493C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemB 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comparison Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A02B47F0-C3AE-432C-878B-29E318927E8B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.SimilarityScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comparison Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD9010D3-5655-4437-8479-D697EED29E74' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.DetectionMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Comparison Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C50DB26E-DFB3-4175-8341-16BBE598A7E8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4BA647B-4EB5-48A8-832F-A5B02F55D4AD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.Resolution 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '32D4867D-F445-4578-AABB-CE5CCD2E3F2F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ResolvedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CFA6CE2-0CE9-4CE9-9365-F385B4907D21' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ResolvedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '855E4E16-CA8D-400B-AD90-EB9DA34F88C9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ResolvedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Tracking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2CBF664D-7BF3-4E48-87AB-20827A225870' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '284B7FC6-1F8E-4038-A496-C28741A65C75' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D3BF8A8-4EA6-41F8-8F66-11AF622F54E7' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-copy */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-copy', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c1e8c11b-7299-4f8b-aea1-4d74e3bce481', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'FieldCategoryInfo', '{"Comparison Details":{"icon":"fa fa-balance-scale","description":"Technical details regarding the similarity between content items and the method of detection."},"Resolution Tracking":{"icon":"fa fa-tasks","description":"Workflow information tracking how and when the duplicate was reviewed and resolved."},"System Metadata":{"icon":"fa fa-database","description":"System-managed identifiers and audit timestamps for record management."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('fac321aa-34ef-4b3e-bcc1-67e131543db7', '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5', 'FieldCategoryIcons', '{"Comparison Details":"fa fa-balance-scale","Resolution Tracking":"fa fa-tasks","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3C7E3EE9-BEBA-49B2-AB61-9BAFA1B40EE5'
      

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '276AB7DE-AE79-4FA2-BFBE-FC5361943DA5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentProcessRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Process Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '31A3DCDC-B3B8-4E4B-8A3D-5E0F77EC117A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '15955547-3BF7-4DFF-9CC7-4A93B9646621' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F50067FD-6424-4622-8F13-17EBF80B4C08' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B4932DB4-9F18-4E5C-B517-58796F7AD33F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentProcessRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Process Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '868F5319-6DDC-4302-BE53-DD0AB3DFA7EF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08C081EF-64EC-4DEF-BD92-391918CC0229' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Type Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6D07F4E6-1501-482B-A394-514855E3912B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ItemsProcessed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E149D9AB-981F-4D11-B53E-E688D26FFC87' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ItemsTagged 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '97C3DEF2-ADF2-4AE1-986D-DBD5DDB04A8A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ItemsVectorized 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD72BA50-C857-493B-8155-CE5A73009A51' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.TagsCreated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF9A81CE-0F36-4253-AC49-1C8C7D6A5974' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.ErrorCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38677041-DCDB-44CE-93A7-F5ECBC4E501E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.StartTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Usage and Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D468C81A-9CBC-43FB-9DBB-C8B802F3A339' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.EndTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Usage and Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F5B3407-5E25-44AB-91AF-81384A0F4A0F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.TotalTokensUsed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Usage and Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B21ADCEC-E96F-4E01-B99C-22BC357DCE53' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.TotalCost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Usage and Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '710AF907-8A83-46D4-B65C-1F3BA629ADF0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C8EB81F-825B-4029-8B5A-3D54719797D3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A719223-F165-44F6-A08E-CEF24813AF94' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tasks */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-tasks', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '4A1EF567-F71F-44A3-9728-FB724062E619'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b2fe928e-3912-4eba-a3b9-c13ab350e4ac', '4A1EF567-F71F-44A3-9728-FB724062E619', 'FieldCategoryInfo', '{"Run Context":{"icon":"fa fa-info-circle","description":"Identification and status of the specific content source being processed within the pipeline"},"Processing Metrics":{"icon":"fa fa-chart-bar","description":"Quantitative results of tagging, vectorization, and error tracking for this source"},"Usage and Timeline":{"icon":"fa fa-clock","description":"Temporal data and resource consumption including token usage and financial costs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6fbb1391-f863-474d-914f-04c89f765de3', '4A1EF567-F71F-44A3-9728-FB724062E619', 'FieldCategoryIcons', '{"Run Context":"fa fa-info-circle","Processing Metrics":"fa fa-chart-bar","Usage and Timeline":"fa fa-clock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '4A1EF567-F71F-44A3-9728-FB724062E619'
      

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Tags.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FB9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.ItemID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Item',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2DB9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Item 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Item Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D73962B-3D7D-489E-837F-732C90578325' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33B9433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A074747-D77B-446C-8B10-204459643FF9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Weight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2EF1276A-D856-4408-A72A-BE0907ABCA75' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Tags.Tag_Virtual 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag (Virtual)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '02A46354-0433-4CCF-ABF3-9478711D2C5B' AND AutoUpdateCategory = 1

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.ContentProcessRunDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt Execution Links',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Process Run Detail',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BEBCC5A-2839-41F0-B8E1-765485DA22A7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.AIPromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt Execution Links',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Prompt Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EB9F962-577D-4FE2-AE00-4F402CE19BFA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.AIPromptRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt Execution Links',
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Run Label',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8771EC60-34B8-4B40-8DCC-0300371EC591' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.RunType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Prompt Execution Links',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F6E688C-E0C4-458B-9E42-2B2BBF1EC8DC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3341BDDE-4619-4A25-8BE4-D88891362821' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '798CBA36-02E7-467E-AEC9-88737953B466' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB1A20A3-4DE9-4760-86E2-B9F98F974B6A' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-robot */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-robot', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('55b30e21-addb-44d2-8920-0e1f08dda917', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'FieldCategoryInfo', '{"Prompt Execution Links":{"icon":"fa fa-link","description":"Associations between content processing steps and their corresponding AI model executions"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8888d77d-b00e-4929-9030-0f06a9b71ecd', '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15', 'FieldCategoryIcons', '{"Prompt Execution Links":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '7AD7A0E4-0C8B-4131-9C6D-A7D90247CD15'
      

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '77DACA3C-60B0-426B-9DD8-98597F2C8EBB'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '01B8433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '77DACA3C-60B0-426B-9DD8-98597F2C8EBB'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E446A7B9-8F1C-47A4-8FBA-53FF05049F2C'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8FB7433E-F36B-1410-867F-007B559E242F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F7F91B01-92FE-4EEB-BE1B-EDB4CFD3F056'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A894D304-A15C-44C3-A8EA-ADD024A01F8C'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '89B7433E-F36B-1410-867F-007B559E242F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A894D304-A15C-44C3-A8EA-ADD024A01F8C'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4507C2EC-B47E-4832-9CAF-F26C8E0121CB'
               AND AutoUpdateDefaultInView = 1
            

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Content Source Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77DACA3C-60B0-426B-9DD8-98597F2C8EBB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Type Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F6988131-FD6D-4E8C-AAAA-143D70F6AC1D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Source Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('03ca98ce-59c0-459c-9d15-27ef97ff8dda', 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"Source Type Details":{"icon":"fa fa-info-circle","description":"Core identification, descriptive information, and technical implementation details for the content source type."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps used for tracking and internal operations."}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Source Type Details":"fa fa-info-circle","System Metadata":"fa fa-cog"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B62E4A4A-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBB09B21-50A3-4CCE-A114-44B0C9835251' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.URL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'BFB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12DE0FA4-7538-42BE-9C11-7638B15B2D78' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CA2DC63-66EC-405B-9974-81FD5129B693' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '3402501E-8128-40E0-BCF8-1BC2867C3931' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F8AEC67-CBBB-47BE-96C8-70795F10849C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E446A7B9-8F1C-47A4-8FBA-53FF05049F2C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocumentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Document',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocument 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '715BCEB6-0B7D-49CB-AC91-3AF520EF90D9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08929B56-9F28-4BB0-9F68-D783E68B8B27' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledAction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70FCDE3C-BD64-496C-8830-4C4D3786A5D6' AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Processing & Automation":{"icon":"fa fa-cogs","description":"Configuration for source processing, entity mapping, and automated synchronization schedules."}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Processing & Automation":"fa fa-cogs"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Content Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.AIModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.AIModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0706EBD4-7D99-4F16-99DF-0E398E319AA3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4FEC28-2617-418E-B476-09722B4A0858' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.MinTags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.MaxTags 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '399CBC27-D03E-4230-9AE3-547E14651719' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6DB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Advanced Configuration":{"icon":"fa fa-tools","description":"Technical JSON settings and processing rules for advanced content management"}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Advanced Configuration":"fa fa-tools"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '354417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.DuplicateRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '364417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.RecordMetadata 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D0181D15-798A-4AA1-82F5-D880ADAFFAC4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.DuplicateRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '87C64C19-39F4-46BC-B95C-265113B019DE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MatchStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.SkippedReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MatchErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MergeStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MergeErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4507C2EC-B47E-4832-9CAF-F26C8E0121CB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Outcomes',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC89E545-1458-43B8-B0A9-C0A5063752BE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '835817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '845817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.SourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B012AEB-14BF-4AD2-99CF-DF6732F55D70' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '16759E5C-8FA0-4816-867A-2504489C4FFD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.CancellationRequested 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE6234BD-E9F5-41F4-838F-F415BEE64B1A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.StartTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.EndTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '83B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.StartedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21D1B5E7-1266-4F46-8F29-7DE40725428A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.StartedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A894D304-A15C-44C3-A8EA-ADD024A01F8C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ProcessedItems 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8FB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.TotalItemCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7F91B01-92FE-4EEB-BE1B-EDB4CFD3F056' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.LastProcessedOffset 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '514B02D3-EEC7-4E9A-82C3-302B0CF363DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.BatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD6B86EB-82FC-45CF-A588-049B3EE24079' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ErrorCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B5F5CF6-45C6-4025-BD44-0BEA11D0BED1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.ErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA318DCB-3D56-4361-9121-C02ADA74BFDB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9BB7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Execution Details":{"icon":"fa fa-tachometer-alt","description":"Timing, metrics, and progress tracking for the content processing workflow execution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Execution Details":"fa fa-tachometer-alt","System Metadata":"fa fa-cog"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '9684A900-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F759B7C5-13E2-4359-AB28-F16EEF9BE1F4'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '332734CB-8E0A-4DAB-8EE7-386FB4576862'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8936A4FD-2E69-471C-B508-E3AA1F289612'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9888E302-447E-472A-A907-0F77DD49B1D7'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'F759B7C5-13E2-4359-AB28-F16EEF9BE1F4'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '9888E302-447E-472A-A907-0F77DD49B1D7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A829129F-3AC3-4945-ACA0-075A3CB6CB22'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '334317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '684317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'FF4E17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2AF32154-3B29-4138-8B1F-5E4441E1ECE3'
               AND AutoUpdateDefaultInView = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7E245D79-0054-4C21-A585-DD7D9A786C02'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '496D6C09-87EF-4964-8EE2-697E9A7CDA34'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B932150B-D06E-4B7A-887C-63E686FD5ECA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1C62A127-1D05-485D-A736-125C10B812AB'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6C659FC6-BC31-4FCF-BE84-B409F9A442C7'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '7E245D79-0054-4C21-A585-DD7D9A786C02'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B932150B-D06E-4B7A-887C-63E686FD5ECA'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '1C62A127-1D05-485D-A736-125C10B812AB'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '6C659FC6-BC31-4FCF-BE84-B409F9A442C7'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A0BD8B24-D8F2-4005-98E1-AD4FC64B557A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DA798589-ECF6-406C-8D6D-0F2B3A4EAD00'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5F1BA3BE-62EF-4C78-A8AF-9505E4DD2F81'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1B87DA36-8226-4CF5-96F7-211A16C7BEF9'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '5F1BA3BE-62EF-4C78-A8AF-9505E4DD2F81'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '1B87DA36-8226-4CF5-96F7-211A16C7BEF9'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Tagged Items.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '304317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '314317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '684317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.Weight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A829129F-3AC3-4945-ACA0-075A3CB6CB22' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '324317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '334317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tagged Items.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagA 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F1BA3BE-62EF-4C78-A8AF-9505E4DD2F81' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagB 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1B87DA36-8226-4CF5-96F7-211A16C7BEF9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagAID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag A ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6D039B78-F386-439A-A952-240FD964A9CE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagBID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag B ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37EB7CDB-4E0A-48D2-BBB5-D84F61847DF9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.CoOccurrenceCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Co-Occurrence Metrics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Co-Occurrence Count',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0BD8B24-D8F2-4005-98E1-AD4FC64B557A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.LastComputedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Co-Occurrence Metrics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA798589-ECF6-406C-8D6D-0F2B3A4EAD00' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52E92F58-D34C-4B58-9CDF-D6F85B80822F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1588428-A8B2-4AA1-9718-B2AB9EFBF6E0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB0BC32C-6196-41FD-8895-B3C7D2BAE598' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-project-diagram', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4e30103a-2d09-4a31-9ed5-ab9186ec462e', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'FieldCategoryInfo', '{"Tag Pair Information":{"icon":"fa fa-tags","description":"Identifiers and names for the specific pair of tags being analyzed"},"Co-Occurrence Metrics":{"icon":"fa fa-chart-bar","description":"Calculated statistical data and processing timestamps for tag relationships"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps used for data maintenance"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('37fbaf3c-234b-4478-9591-58183ccb4c36', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571', 'FieldCategoryIcons', '{"Tag Pair Information":"fa fa-tags","Co-Occurrence Metrics":"fa fa-chart-bar","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C353DB72-DE7C-4674-98D0-D4DDB9D41571'
      

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '334F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '344F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.StartedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Started By',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '354F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.StartedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '404417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.SourceListID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.SourceList 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Source List Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '424417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.StartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '364F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.EndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '374F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovalStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '384F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovalComments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '394F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Approved By',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ApprovedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '414417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ProcessingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ProcessingErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.TotalItemCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2AF32154-3B29-4138-8B1F-5E4441E1ECE3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.ProcessedItemCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF9AAA70-8D37-40D7-B199-A8CE50280187' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.LastProcessedOffset 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5345C54-99D1-48E0-9FB4-E446BECFC636' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.BatchSize 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81A0AE82-E71B-4CD1-BBEE-E736E33E5021' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.CancellationRequested 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18316158-4D88-4C83-B3AA-8DDA18FECE5D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '815817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '825817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF451377-BB03-44BE-8847-1AD05DBBE35C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB748BE8-F23A-4D4D-876E-F892973FBE00' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Criteria',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95B2CE20-2228-4B07-B973-AADA70961477' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.Query 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Criteria',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F759B7C5-13E2-4359-AB28-F16EEF9BE1F4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.Filters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Criteria',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '906B2CC8-8A68-4A78-8C1A-16213D2EFD9B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.MinScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Results and Notifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Minimum Score',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1586777B-02AD-42CB-A253-CA9133845ECA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.MaxResults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Results and Notifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Maximum Results',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F25BA9C1-F392-4B50-9743-27B0A6A25C71' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.NotifyOnNewResults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Results and Notifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '332734CB-8E0A-4DAB-8EE7-386FB4576862' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8936A4FD-2E69-471C-B508-E3AA1F289612' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2862182A-6190-44F4-A5A1-3A0FB2A3824F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Ownership',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9888E302-447E-472A-A907-0F77DD49B1D7' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-search-plus */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search-plus', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5fe1c472-812e-49fa-882d-6f5f7d67e6a2', 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', 'FieldCategoryInfo', '{"Search Criteria":{"icon":"fa fa-search","description":"Core parameters including the search query text and specific filters applied to the search."},"Results and Notifications":{"icon":"fa fa-bell","description":"Settings for result limits, scoring thresholds, and automated notification preferences."},"Ownership":{"icon":"fa fa-user-tag","description":"Information identifying the user who created and manages this saved search."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit timestamps and unique identifiers."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c7003ed5-902b-47a7-8cf2-c555e8b21c93', 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA', 'FieldCategoryIcons', '{"Search Criteria":"fa fa-search","Results and Notifications":"fa fa-bell","Ownership":"fa fa-user-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'E5A86E2B-BE0B-4344-8D45-32D6F0C850EA'
      

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6DAF6BA0-0646-4CFB-8AD7-8A9E1E2BBA42' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Affected Tags',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '46CD46EA-A20B-4A44-AF88-083AAB58D441' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.Action 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Event',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E245D79-0054-4C21-A585-DD7D9A786C02' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.Details 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Event',
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Details',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '8552A352-55E9-4DAC-B66C-6A8C6AB6DD6C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.PerformedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Event',
   GeneratedFormSection = 'Category',
   DisplayName = 'Performed By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F9C0FD7-6F54-4155-94B8-DD71D886D200' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.RelatedTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Affected Tags',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D390D4F-8CCA-478A-B7D0-6086BEC11C67' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '496D6C09-87EF-4964-8EE2-697E9A7CDA34' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5991821A-3B5C-486C-88FA-2C9914130AA1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Affected Tags',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B932150B-D06E-4B7A-887C-63E686FD5ECA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.PerformedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Event',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C62A127-1D05-485D-A736-125C10B812AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.RelatedTag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Affected Tags',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C659FC6-BC31-4FCF-BE84-B409F9A442C7' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-history', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '30CB615E-D556-46DE-9E15-CED108FCEE84'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('22f9ceae-4e15-462f-b056-b345de443378', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'FieldCategoryInfo', '{"Audit Event":{"icon":"fa fa-clipboard-list","description":"Core information about the action performed and the user responsible for the change"},"Affected Tags":{"icon":"fa fa-tags","description":"Information regarding the primary and related tags involved in the taxonomy change"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e07509d4-23b2-43dc-8d5d-9a4c9da9ae84', '30CB615E-D556-46DE-9E15-CED108FCEE84', 'FieldCategoryIcons', '{"Audit Event":"fa fa-clipboard-list","Affected Tags":"fa fa-tags","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '30CB615E-D556-46DE-9E15-CED108FCEE84'
      

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '44B30122-35F7-4954-82AA-329F26486ED5'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '674317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: Tags.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44B30122-35F7-4954-82AA-329F26486ED5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MergedIntoTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Merged Into Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23E00FA1-C0B5-4370-B526-78F65F2571D2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MergedIntoTag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Merged Into Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD942B17-CF54-41C5-B8B3-6A66BAC2C41E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.RootMergedIntoTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Merged Into Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D47C8E2A-AAAC-4C4D-992E-F595DC94877C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '674317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Parent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55C353F4-3F77-4BE6-B931-AA23603CF3CA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('71ec68f8-7753-4807-ac51-94da8a4f0415', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Tag Lifecycle":{"icon":"fa fa-sync-alt","description":"Fields managing the operational state and consolidation history of the tag"}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Tag Lifecycle":"fa fa-sync-alt"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Generated Validation Functions for MJ: Tag Co Occurrences */
-- CHECK constraint for MJ: Tag Co Occurrences @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([TagAID]<[TagBID])', 'public ValidateTagAIDLessThanTagBID(result: ValidationResult) {
	if (this.TagAID != null && this.TagBID != null && this.TagAID >= this.TagBID) {
		result.Errors.push(new ValidationErrorInfo(
			"TagAID",
			"Tag A must be ordered before Tag B to ensure a consistent ordering of tag pairs.",
			this.TagAID,
			ValidationErrorType.Failure
		));
	}
}', 'Tag A must be ordered before Tag B to ensure that each pair of tags is stored consistently and to prevent duplicate entries for the same combination.', 'ValidateTagAIDLessThanTagBID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C353DB72-DE7C-4674-98D0-D4DDB9D41571');

            

