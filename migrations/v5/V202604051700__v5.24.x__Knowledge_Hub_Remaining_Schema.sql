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
    CONSTRAINT UQ_TagCoOccurrence_Pair UNIQUE (TagAID, TagBID),
    CONSTRAINT CK_TagCoOccurrence_Order CHECK (TagAID < TagBID)
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





























































-- CODE GEN RUN
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
         '475dff6c-d700-45d9-8892-126e06dc18ec',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '475dff6c-d700-45d9-8892-126e06dc18ec', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('475dff6c-d700-45d9-8892-126e06dc18ec', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('475dff6c-d700-45d9-8892-126e06dc18ec', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Audit Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('475dff6c-d700-45d9-8892-126e06dc18ec', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         '48bb6d0f-f836-4a0c-984c-5ce682334818',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '48bb6d0f-f836-4a0c-984c-5ce682334818', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('48bb6d0f-f836-4a0c-984c-5ce682334818', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('48bb6d0f-f836-4a0c-984c-5ce682334818', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Content Item Duplicates for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('48bb6d0f-f836-4a0c-984c-5ce682334818', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         'b4492451-bfa1-4a67-9799-c82bb98856eb',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b4492451-bfa1-4a67-9799-c82bb98856eb', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b4492451-bfa1-4a67-9799-c82bb98856eb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b4492451-bfa1-4a67-9799-c82bb98856eb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Co Occurrences for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b4492451-bfa1-4a67-9799-c82bb98856eb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         'bb965bff-d1ce-4301-ae1d-f15f5cadad11',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bb965bff-d1ce-4301-ae1d-f15f5cadad11', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bb965bff-d1ce-4301-ae1d-f15f5cadad11', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bb965bff-d1ce-4301-ae1d-f15f5cadad11', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Knowledge Hub Saved Searches for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bb965bff-d1ce-4301-ae1d-f15f5cadad11', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
UPDATE [${flyway:defaultSchema}].[TagAuditLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD CONSTRAINT [DF___mj_TagAuditLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
UPDATE [${flyway:defaultSchema}].[TagAuditLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[TagAuditLog] ADD CONSTRAINT [DF___mj_TagAuditLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
UPDATE [${flyway:defaultSchema}].[ContentItemDuplicate] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD CONSTRAINT [DF___mj_ContentItemDuplicate___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
UPDATE [${flyway:defaultSchema}].[ContentItemDuplicate] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ContentItemDuplicate */
ALTER TABLE [${flyway:defaultSchema}].[ContentItemDuplicate] ADD CONSTRAINT [DF___mj_ContentItemDuplicate___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
UPDATE [${flyway:defaultSchema}].[TagCoOccurrence] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD CONSTRAINT [DF___mj_TagCoOccurrence___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
UPDATE [${flyway:defaultSchema}].[TagCoOccurrence] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagCoOccurrence */
ALTER TABLE [${flyway:defaultSchema}].[TagCoOccurrence] ADD CONSTRAINT [DF___mj_TagCoOccurrence___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
UPDATE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD CONSTRAINT [DF___mj_KnowledgeHubSavedSearch___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
UPDATE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
ALTER TABLE [${flyway:defaultSchema}].[KnowledgeHubSavedSearch] ADD CONSTRAINT [DF___mj_KnowledgeHubSavedSearch___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca0fdb6c-be39-4465-9e94-c430794e28e3' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'ID')) BEGIN
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
            'ca0fdb6c-be39-4465-9e94-c430794e28e3',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d93df1e-9ac3-4574-9a0a-ace2e82e3b6f' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'TagID')) BEGIN
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
            '2d93df1e-9ac3-4574-9a0a-ace2e82e3b6f',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf8353b2-2ec8-4a4f-8916-b12a5eb92e97' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'Action')) BEGIN
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
            'cf8353b2-2ec8-4a4f-8916-b12a5eb92e97',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8275d59b-4a7e-4261-9bfc-4c5e9d8015fc' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'Details')) BEGIN
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
            '8275d59b-4a7e-4261-9bfc-4c5e9d8015fc',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b45a9709-dc61-4deb-bb2b-bf633ec3b1f9' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'PerformedByUserID')) BEGIN
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
            'b45a9709-dc61-4deb-bb2b-bf633ec3b1f9',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4978b653-c865-476d-b36b-821711da1ed9' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'RelatedTagID')) BEGIN
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
            '4978b653-c865-476d-b36b-821711da1ed9',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0be53519-3bd4-4552-afb1-4ada87291e92' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = '__mj_CreatedAt')) BEGIN
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
            '0be53519-3bd4-4552-afb1-4ada87291e92',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a28e96c9-2d6b-488d-8872-e18510c1bf8b' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'a28e96c9-2d6b-488d-8872-e18510c1bf8b',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45eef622-219a-4c97-a601-c7f0f379b128' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ID')) BEGIN
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
            '45eef622-219a-4c97-a601-c7f0f379b128',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f60f12a5-6fb9-4d49-bfcb-64a85f75e66d' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ContentItemAID')) BEGIN
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
            'f60f12a5-6fb9-4d49-bfcb-64a85f75e66d',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbd5e19c-aeeb-461f-92de-5f7fbba89e6a' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ContentItemBID')) BEGIN
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
            'dbd5e19c-aeeb-461f-92de-5f7fbba89e6a',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84991e96-8b03-41ba-b549-8ed8928d0cea' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'SimilarityScore')) BEGIN
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
            '84991e96-8b03-41ba-b549-8ed8928d0cea',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e491422-b76a-4b7b-92f3-f7c97652c86a' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'DetectionMethod')) BEGIN
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
            '0e491422-b76a-4b7b-92f3-f7c97652c86a',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4e57e9a-c711-4997-85e6-e4b9ec3418c3' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'Status')) BEGIN
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
            'e4e57e9a-c711-4997-85e6-e4b9ec3418c3',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a53665f-9104-4f21-840e-dbd063497394' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ResolvedByUserID')) BEGIN
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
            '1a53665f-9104-4f21-840e-dbd063497394',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fabe961-c769-4d06-8030-313c693d7758' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ResolvedAt')) BEGIN
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
            '9fabe961-c769-4d06-8030-313c693d7758',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2084e343-f761-4fcb-bb3a-52bbb60581d0' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'Resolution')) BEGIN
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
            '2084e343-f761-4fcb-bb3a-52bbb60581d0',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fcc0c51-be9f-4439-9925-af5176a05a01' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1fcc0c51-be9f-4439-9925-af5176a05a01',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d3963e6-9bf8-41c4-9f80-2e44bef1e4ac' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4d3963e6-9bf8-41c4-9f80-2e44bef1e4ac',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72eae5bb-3d9b-4840-b15f-36b84e028184' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Status')) BEGIN
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
            '72eae5bb-3d9b-4840-b15f-36b84e028184',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c67ff975-f08c-46a5-b4ab-73e13ab33bfe' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MergedIntoTagID')) BEGIN
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
            'c67ff975-f08c-46a5-b4ab-73e13ab33bfe',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67648fc9-899d-40ce-873a-fe7e17e099da' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ScheduledActionID')) BEGIN
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
            '67648fc9-899d-40ce-873a-fe7e17e099da',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100034,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fdeb860-cc7f-4de5-90f2-bdeb521e673f' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingStatus')) BEGIN
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
            '5fdeb860-cc7f-4de5-90f2-bdeb521e673f',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100032,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4711b2d-7a6c-46f7-8978-2e780e21b428' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastEmbeddedAt')) BEGIN
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
            'f4711b2d-7a6c-46f7-8978-2e780e21b428',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100033,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a25fdde3-10f4-40b0-be93-34afafa3c781' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModelID')) BEGIN
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
            'a25fdde3-10f4-40b0-be93-34afafa3c781',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100034,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c8e896cf-7165-41ae-827b-0192f65e457f' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'TaggingStatus')) BEGIN
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
            'c8e896cf-7165-41ae-827b-0192f65e457f',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100035,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '943edba1-819e-485c-a83c-cd628cb80219' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'LastTaggedAt')) BEGIN
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
            '943edba1-819e-485c-a83c-cd628cb80219',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100036,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ea5dad9-bcc1-4c54-b4de-959e27fb9642' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = 'ID')) BEGIN
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
            '0ea5dad9-bcc1-4c54-b4de-959e27fb9642',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f39ac4d2-09d3-4f23-9195-3a4f97e78bb9' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = 'TagAID')) BEGIN
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
            'f39ac4d2-09d3-4f23-9195-3a4f97e78bb9',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5de98f7-b54b-4d7a-a116-684d670f4e44' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = 'TagBID')) BEGIN
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
            'a5de98f7-b54b-4d7a-a116-684d670f4e44',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b06dde6d-d02d-490f-8c76-0ea7a0386228' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = 'CoOccurrenceCount')) BEGIN
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
            'b06dde6d-d02d-490f-8c76-0ea7a0386228',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2be5a632-bc34-45e3-931e-a8f26e1a9bf4' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = 'LastComputedAt')) BEGIN
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
            '2be5a632-bc34-45e3-931e-a8f26e1a9bf4',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7ecc351-0d08-4f09-b7da-ed44a43e472b' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a7ecc351-0d08-4f09-b7da-ed44a43e472b',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e044e33-5cc0-49de-8c76-77a8ed044888' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6e044e33-5cc0-49de-8c76-77a8ed044888',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35ab49be-e38d-43dc-91a7-2e2eff6cd8f2' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'ID')) BEGIN
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
            '35ab49be-e38d-43dc-91a7-2e2eff6cd8f2',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f29d3e6-6bbc-4d0a-b6f3-ce81c72187f3' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'UserID')) BEGIN
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
            '0f29d3e6-6bbc-4d0a-b6f3-ce81c72187f3',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b61c86c-8154-41f0-9901-96d7bee99a5e' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'Name')) BEGIN
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
            '3b61c86c-8154-41f0-9901-96d7bee99a5e',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e472ead3-f41a-4e9e-8dd4-5f6cc1202f19' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'Query')) BEGIN
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
            'e472ead3-f41a-4e9e-8dd4-5f6cc1202f19',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15565ef5-5225-43e3-93be-6d2ef8e95cce' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'Filters')) BEGIN
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
            '15565ef5-5225-43e3-93be-6d2ef8e95cce',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c5c80a1-2ae0-410d-8241-9404743dd227' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'MinScore')) BEGIN
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
            '1c5c80a1-2ae0-410d-8241-9404743dd227',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b9628fa-d61e-42f7-ad1b-443b2e15a877' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'MaxResults')) BEGIN
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
            '2b9628fa-d61e-42f7-ad1b-443b2e15a877',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8444cf76-8392-4067-a05d-cb15c2bad467' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'NotifyOnNewResults')) BEGIN
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
            '8444cf76-8392-4067-a05d-cb15c2bad467',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3df6901a-ec14-4f3e-8789-1325bda244fd' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = '__mj_CreatedAt')) BEGIN
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
            '3df6901a-ec14-4f3e-8789-1325bda244fd',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bebfd1e1-a1da-4489-ab2d-c3ea80e4275f' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'bebfd1e1-a1da-4489-ab2d-c3ea80e4275f',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

/* SQL text to insert entity field value with ID 2cce9715-1156-42fb-9aaf-0c4668c17543 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2cce9715-1156-42fb-9aaf-0c4668c17543', '72EAE5BB-3D9B-4840-B15F-36B84E028184', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 8bd4cf81-dd41-4241-afc4-795a5cbe6405 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8bd4cf81-dd41-4241-afc4-795a5cbe6405', '72EAE5BB-3D9B-4840-B15F-36B84E028184', 2, 'Deleted', 'Deleted', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e16666f4-faf5-472e-82d0-6a77a4be1db3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e16666f4-faf5-472e-82d0-6a77a4be1db3', '72EAE5BB-3D9B-4840-B15F-36B84E028184', 3, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 0fe8274a-a993-4cb9-a5ec-e86f75d946e8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0fe8274a-a993-4cb9-a5ec-e86f75d946e8', '72EAE5BB-3D9B-4840-B15F-36B84E028184', 4, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 72EAE5BB-3D9B-4840-B15F-36B84E028184 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='72EAE5BB-3D9B-4840-B15F-36B84E028184'

/* SQL text to insert entity field value with ID 0fde1d36-73a8-456d-9471-d9eaafc7e755 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0fde1d36-73a8-456d-9471-d9eaafc7e755', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 1, 'Created', 'Created', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 0fbca4b9-ef26-4011-a873-d68afc23bb26 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0fbca4b9-ef26-4011-a873-d68afc23bb26', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 2, 'Deleted', 'Deleted', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 08266dfb-9d10-48b6-b3cf-af1587a40301 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('08266dfb-9d10-48b6-b3cf-af1587a40301', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 3, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID a3958830-fef1-4067-93c1-e4d08b2edafb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a3958830-fef1-4067-93c1-e4d08b2edafb', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 4, 'DescriptionChanged', 'DescriptionChanged', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 3df79fc1-aef3-45b3-8d54-62699795dbdf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3df79fc1-aef3-45b3-8d54-62699795dbdf', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 5, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 2db6b2f8-ae67-4886-ae84-79cd7445b439 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2db6b2f8-ae67-4886-ae84-79cd7445b439', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 6, 'Moved', 'Moved', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 3d98a39b-d7e4-49dd-8c5c-395564610635 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3d98a39b-d7e4-49dd-8c5c-395564610635', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 7, 'Reactivated', 'Reactivated', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID f74e52ac-4153-456d-97d8-492473bce9be */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f74e52ac-4153-456d-97d8-492473bce9be', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 8, 'Renamed', 'Renamed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ef1df38f-86b7-4f80-bd29-0a23cc1f6339 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef1df38f-86b7-4f80-bd29-0a23cc1f6339', 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97', 9, 'Split', 'Split', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID CF8353B2-2EC8-4A4F-8916-B12A5EB92E97 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CF8353B2-2EC8-4A4F-8916-B12A5EB92E97'

/* SQL text to insert entity field value with ID dbac52ba-b963-422b-bcb1-1c27fe9077d7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dbac52ba-b963-422b-bcb1-1c27fe9077d7', '0E491422-B76A-4B7B-92F3-F7C97652C86A', 1, 'Checksum', 'Checksum', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID cc9c30f1-92d2-488c-8700-c4ee6e28f54e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cc9c30f1-92d2-488c-8700-c4ee6e28f54e', '0E491422-B76A-4B7B-92F3-F7C97652C86A', 2, 'Title', 'Title', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 49230c49-9630-4eb7-aa24-266b5ef526d5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('49230c49-9630-4eb7-aa24-266b5ef526d5', '0E491422-B76A-4B7B-92F3-F7C97652C86A', 3, 'URL', 'URL', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 356a1ff4-75c4-4011-bb16-1d119dde8b09 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('356a1ff4-75c4-4011-bb16-1d119dde8b09', '0E491422-B76A-4B7B-92F3-F7C97652C86A', 4, 'Vector', 'Vector', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 0E491422-B76A-4B7B-92F3-F7C97652C86A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0E491422-B76A-4B7B-92F3-F7C97652C86A'

/* SQL text to insert entity field value with ID c352d542-933e-4c1a-abe0-d62b880aebf3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c352d542-933e-4c1a-abe0-d62b880aebf3', 'E4E57E9A-C711-4997-85E6-E4B9EC3418C3', 1, 'Confirmed', 'Confirmed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 872348bc-ffb2-454e-9bce-09690130b59d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('872348bc-ffb2-454e-9bce-09690130b59d', 'E4E57E9A-C711-4997-85E6-E4B9EC3418C3', 2, 'Dismissed', 'Dismissed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID abbd61e8-d19c-4462-b033-86c31fe690a7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('abbd61e8-d19c-4462-b033-86c31fe690a7', 'E4E57E9A-C711-4997-85E6-E4B9EC3418C3', 3, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 9863f74e-c248-4993-a330-f7505f4c676f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9863f74e-c248-4993-a330-f7505f4c676f', 'E4E57E9A-C711-4997-85E6-E4B9EC3418C3', 4, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID E4E57E9A-C711-4997-85E6-E4B9EC3418C3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E4E57E9A-C711-4997-85E6-E4B9EC3418C3'

/* SQL text to insert entity field value with ID a3164589-2d0c-4e8d-8de0-52ccde23386e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a3164589-2d0c-4e8d-8de0-52ccde23386e', '2084E343-F761-4FCB-BB3A-52BBB60581D0', 1, 'KeepA', 'KeepA', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6651a803-3776-4e55-b8aa-9420de7c0082 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6651a803-3776-4e55-b8aa-9420de7c0082', '2084E343-F761-4FCB-BB3A-52BBB60581D0', 2, 'KeepB', 'KeepB', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID b38f2bb0-bc93-44e7-b15a-b2e22cc07f85 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b38f2bb0-bc93-44e7-b15a-b2e22cc07f85', '2084E343-F761-4FCB-BB3A-52BBB60581D0', 3, 'MergeBoth', 'MergeBoth', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e4da8092-96f7-4957-9a0d-fd5de185dcc6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e4da8092-96f7-4957-9a0d-fd5de185dcc6', '2084E343-F761-4FCB-BB3A-52BBB60581D0', 4, 'NotDuplicate', 'NotDuplicate', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 2084E343-F761-4FCB-BB3A-52BBB60581D0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2084E343-F761-4FCB-BB3A-52BBB60581D0'

/* SQL text to insert entity field value with ID 035617b4-6803-414c-bec5-7df86c737d55 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('035617b4-6803-414c-bec5-7df86c737d55', '5FDEB860-CC7F-4DE5-90F2-BDEB521E673F', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 44f0be0d-e19c-42a0-9c4a-67423b4b4cc7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('44f0be0d-e19c-42a0-9c4a-67423b4b4cc7', '5FDEB860-CC7F-4DE5-90F2-BDEB521E673F', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ad6b74e5-b1dc-4793-bc8d-6a47900d827c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ad6b74e5-b1dc-4793-bc8d-6a47900d827c', '5FDEB860-CC7F-4DE5-90F2-BDEB521E673F', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 45ea59d0-6568-43e6-b406-ae9950075b30 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('45ea59d0-6568-43e6-b406-ae9950075b30', '5FDEB860-CC7F-4DE5-90F2-BDEB521E673F', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 21226e3f-40d1-4cd6-93b4-70e0d4f696c3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('21226e3f-40d1-4cd6-93b4-70e0d4f696c3', '5FDEB860-CC7F-4DE5-90F2-BDEB521E673F', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 5FDEB860-CC7F-4DE5-90F2-BDEB521E673F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5FDEB860-CC7F-4DE5-90F2-BDEB521E673F'

/* SQL text to insert entity field value with ID c865c898-9d2f-45a7-8615-1b9cf9f72d56 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c865c898-9d2f-45a7-8615-1b9cf9f72d56', 'C8E896CF-7165-41AE-827B-0192F65E457F', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 595e8278-e2aa-4d2a-8158-b95a9846d4c3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('595e8278-e2aa-4d2a-8158-b95a9846d4c3', 'C8E896CF-7165-41AE-827B-0192F65E457F', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 5962b5b2-0727-46cd-8e58-0b9d344faaf7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5962b5b2-0727-46cd-8e58-0b9d344faaf7', 'C8E896CF-7165-41AE-827B-0192F65E457F', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6456e4b4-2197-4693-95fd-f4217f2deeb6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6456e4b4-2197-4693-95fd-f4217f2deeb6', 'C8E896CF-7165-41AE-827B-0192F65E457F', 4, 'Processing', 'Processing', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID ad7e342a-b6d8-4790-9ecf-7b817f9d2c85 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ad7e342a-b6d8-4790-9ecf-7b817f9d2c85', 'C8E896CF-7165-41AE-827B-0192F65E457F', 5, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID C8E896CF-7165-41AE-827B-0192F65E457F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C8E896CF-7165-41AE-827B-0192F65E457F'


/* Create Entity Relationship: MJ: Scheduled Actions -> MJ: Content Sources (One To Many via ScheduledActionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f0fa7873-386a-45be-a997-d55d1b1d46bc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f0fa7873-386a-45be-a997-d55d1b1d46bc', '12CD5A5D-A83B-EF11-86D4-0022481D1B23', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'ScheduledActionID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Tag Audit Logs (One To Many via PerformedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '11794957-4172-43c4-b5d1-ef7807811c41'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('11794957-4172-43c4-b5d1-ef7807811c41', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '475DFF6C-D700-45D9-8892-126E06DC18EC', 'PerformedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Content Item Duplicates (One To Many via ResolvedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e360010f-1644-4b4e-95f9-f9e6093b3b33'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e360010f-1644-4b4e-95f9-f9e6093b3b33', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '48BB6D0F-F836-4A0C-984C-5CE682334818', 'ResolvedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Knowledge Hub Saved Searches (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6bf6edd2-2c40-484d-bbb2-181b1f7aa361'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6bf6edd2-2c40-484d-bbb2-181b1f7aa361', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', 'UserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Models -> MJ: Content Items (One To Many via EmbeddingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '07e3abed-bf92-4fc2-afa2-4e3415c344b8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('07e3abed-bf92-4fc2-afa2-4e3415c344b8', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'EmbeddingModelID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Tags -> MJ: Tags (One To Many via MergedIntoTagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8e590554-053f-4b20-8280-a423c2fa10fe'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8e590554-053f-4b20-8280-a423c2fa10fe', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'MergedIntoTagID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Audit Logs (One To Many via RelatedTagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4b958341-e6f1-4d9e-8623-622a3c214e6a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4b958341-e6f1-4d9e-8623-622a3c214e6a', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '475DFF6C-D700-45D9-8892-126E06DC18EC', 'RelatedTagID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Audit Logs (One To Many via TagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5883b9f4-ad1b-4a68-b64e-214d7eef4bb7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5883b9f4-ad1b-4a68-b64e-214d7eef4bb7', '0C248F34-2837-EF11-86D4-6045BDEE16E6', '475DFF6C-D700-45D9-8892-126E06DC18EC', 'TagID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Tags -> MJ: Tag Co Occurrences (One To Many via TagAID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bd2187d9-a8fc-43c8-ac74-01787a0feed4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bd2187d9-a8fc-43c8-ac74-01787a0feed4', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'B4492451-BFA1-4A67-9799-C82BB98856EB', 'TagAID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Co Occurrences (One To Many via TagBID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9f884ddd-ef07-4ce9-b1d2-cb2eb3d95dd2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9f884ddd-ef07-4ce9-b1d2-cb2eb3d95dd2', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'B4492451-BFA1-4A67-9799-C82BB98856EB', 'TagBID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Items -> MJ: Content Item Duplicates (One To Many via ContentItemBID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dfb0751d-0d8b-471b-b140-385d5afa0eea'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dfb0751d-0d8b-471b-b140-385d5afa0eea', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', '48BB6D0F-F836-4A0C-984C-5CE682334818', 'ContentItemBID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Content Items -> MJ: Content Item Duplicates (One To Many via ContentItemAID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ad5fb72d-d5a4-4855-bc54-d7984b424a85'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ad5fb72d-d5a4-4855-bc54-d7984b424a85', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', '48BB6D0F-F836-4A0C-984C-5CE682334818', 'ContentItemAID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID F60F12A5-6FB9-4D49-BFCB-64A85F75E66D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F60F12A5-6FB9-4D49-BFCB-64A85F75E66D', @RelatedEntityNameFieldMap='ContentItemA'

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

/* SQL text to update entity field related entity name field map for entity field ID A25FDDE3-10F4-40B0-BE93-34AFAFA3C781 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A25FDDE3-10F4-40B0-BE93-34AFAFA3C781', @RelatedEntityNameFieldMap='EmbeddingModel'

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
    MJContentProcessRun_ContentProcessRunID.[StartTime] AS [ContentProcessRun],
    MJContentSource_ContentSourceID.[Name] AS [ContentSource],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType]
FROM
    [${flyway:defaultSchema}].[ContentProcessRunDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentProcessRun] AS MJContentProcessRun_ContentProcessRunID
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



/* SQL text to update entity field related entity name field map for entity field ID DBD5E19C-AEEB-461F-92DE-5F7FBBA89E6A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DBD5E19C-AEEB-461F-92DE-5F7FBBA89E6A', @RelatedEntityNameFieldMap='ContentItemB'

/* SQL text to update entity field related entity name field map for entity field ID 1A53665F-9104-4F21-840E-DBD063497394 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1A53665F-9104-4F21-840E-DBD063497394', @RelatedEntityNameFieldMap='ResolvedByUser'

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



/* SQL text to update entity field related entity name field map for entity field ID EA0E3C91-3614-44A4-ACD0-A3147C734B63 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EA0E3C91-3614-44A4-ACD0-A3147C734B63', @RelatedEntityNameFieldMap='ContentProcessRunDetail'

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
    MJContentProcessRunDetail_ContentProcessRunDetailID.[ContentSource] AS [ContentProcessRunDetail],
    MJAIPromptRun_AIPromptRunID.[RunName] AS [AIPromptRun]
FROM
    [${flyway:defaultSchema}].[ContentProcessRunPromptRun] AS c
INNER JOIN
    [${flyway:defaultSchema}].[vwContentProcessRunDetails] AS MJContentProcessRunDetail_ContentProcessRunDetailID
  ON
    [c].[ContentProcessRunDetailID] = MJContentProcessRunDetail_ContentProcessRunDetailID.[ID]
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

/* SQL text to update entity field related entity name field map for entity field ID 67648FC9-899D-40CE-873A-FE7E17E099DA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='67648FC9-899D-40CE-873A-FE7E17E099DA', @RelatedEntityNameFieldMap='ScheduledAction'

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
    MJDuplicateRun_DuplicateRunID.[StartedAt] AS [DuplicateRun]
FROM
    [${flyway:defaultSchema}].[DuplicateRunDetail] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DuplicateRun] AS MJDuplicateRun_DuplicateRunID
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

/* SQL text to update entity field related entity name field map for entity field ID 0F29D3E6-6BBC-4D0A-B6F3-CE81C72187F3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0F29D3E6-6BBC-4D0A-B6F3-CE81C72187F3', @RelatedEntityNameFieldMap='User'

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

/* SQL text to update entity field related entity name field map for entity field ID 2D93DF1E-9AC3-4574-9A0A-ACE2E82E3B6F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2D93DF1E-9AC3-4574-9A0A-ACE2E82E3B6F', @RelatedEntityNameFieldMap='Tag'

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

/* SQL text to update entity field related entity name field map for entity field ID F39AC4D2-09D3-4F23-9195-3A4F97E78BB9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F39AC4D2-09D3-4F23-9195-3A4F97E78BB9', @RelatedEntityNameFieldMap='TagA'

/* SQL text to update entity field related entity name field map for entity field ID A5DE98F7-B54B-4D7A-A116-684D670F4E44 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A5DE98F7-B54B-4D7A-A116-684D670F4E44', @RelatedEntityNameFieldMap='TagB'

/* SQL text to update entity field related entity name field map for entity field ID B45A9709-DC61-4DEB-BB2B-BF633EC3B1F9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B45A9709-DC61-4DEB-BB2B-BF633EC3B1F9', @RelatedEntityNameFieldMap='PerformedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 4978B653-C865-476D-B36B-821711DA1ED9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4978B653-C865-476D-B36B-821711DA1ED9', @RelatedEntityNameFieldMap='RelatedTag'

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

/* SQL text to update entity field related entity name field map for entity field ID C67FF975-F08C-46A5-B4AB-73E13AB33BFE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C67FF975-F08C-46A5-B4AB-73E13AB33BFE', @RelatedEntityNameFieldMap='MergedIntoTag'

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



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b909919-9dd9-4726-b474-f61c76ca945a' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'Tag')) BEGIN
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
            '4b909919-9dd9-4726-b474-f61c76ca945a',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbbc8e58-a342-4476-b226-e539d9cfa2ac' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'PerformedByUser')) BEGIN
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
            'dbbc8e58-a342-4476-b226-e539d9cfa2ac',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e0afc7a9-8de1-4b5e-8d12-1ebea9a052eb' OR (EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC' AND Name = 'RelatedTag')) BEGIN
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
            'e0afc7a9-8de1-4b5e-8d12-1ebea9a052eb',
            '475DFF6C-D700-45D9-8892-126E06DC18EC', -- Entity: MJ: Tag Audit Logs
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e0424d1-5814-4227-a07a-b705cb0bd2b4' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ContentItemA')) BEGIN
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
            '8e0424d1-5814-4227-a07a-b705cb0bd2b4',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67977600-8d7d-4481-bd14-d8e5abdf74f0' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ContentItemB')) BEGIN
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
            '67977600-8d7d-4481-bd14-d8e5abdf74f0',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64acae5b-7393-44c1-aee2-651fb77c5f31' OR (EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818' AND Name = 'ResolvedByUser')) BEGIN
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
            '64acae5b-7393-44c1-aee2-651fb77c5f31',
            '48BB6D0F-F836-4A0C-984C-5CE682334818', -- Entity: MJ: Content Item Duplicates
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '365a3f31-543b-4a2a-9ac9-985f2d52f3ef' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MergedIntoTag')) BEGIN
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
            '365a3f31-543b-4a2a-9ac9-985f2d52f3ef',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '036aff71-913c-4148-9561-4868c38b0508' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootMergedIntoTagID')) BEGIN
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
            '036aff71-913c-4148-9561-4868c38b0508',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef73bc99-09f0-4b92-abfc-47104016dcc5' OR (EntityID = 'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC' AND Name = 'ContentProcessRunDetail')) BEGIN
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
            'ef73bc99-09f0-4b92-abfc-47104016dcc5',
            'E3DF2CFB-3AFB-4868-ADBD-94F133F52ACC', -- Entity: MJ: Content Process Run Prompt Runs
            100014,
            'ContentProcessRunDetail',
            'Content Process Run Detail',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73dd17eb-c852-49bf-900a-8091feee98db' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'ScheduledAction')) BEGIN
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
            '73dd17eb-c852-49bf-900a-8091feee98db',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            100043,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58df231c-37a8-4117-b892-64ea2df12ada' OR (EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'EmbeddingModel')) BEGIN
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
            '58df231c-37a8-4117-b892-64ea2df12ada',
            'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Items
            100047,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ef42a89-2329-4417-a7fa-cabcc41feafd' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = 'TagA')) BEGIN
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
            '0ef42a89-2329-4417-a7fa-cabcc41feafd',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3146b46b-2d1b-4f40-b0cb-bfdb589b9cf6' OR (EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB' AND Name = 'TagB')) BEGIN
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
            '3146b46b-2d1b-4f40-b0cb-bfdb589b9cf6',
            'B4492451-BFA1-4A67-9799-C82BB98856EB', -- Entity: MJ: Tag Co Occurrences
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3390357-0764-4e2c-b738-af173e6ddffc' OR (EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11' AND Name = 'User')) BEGIN
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
            'b3390357-0764-4e2c-b738-af173e6ddffc',
            'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', -- Entity: MJ: Knowledge Hub Saved Searches
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '8E0424D1-5814-4227-A07A-B705CB0BD2B4'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '67977600-8D7D-4481-BD14-D8E5ABDF74F0'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '84991E96-8B03-41BA-B549-8ED8928D0CEA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0E491422-B76A-4B7B-92F3-F7C97652C86A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E4E57E9A-C711-4997-85E6-E4B9EC3418C3'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2084E343-F761-4FCB-BB3A-52BBB60581D0'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8E0424D1-5814-4227-A07A-B705CB0BD2B4'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '67977600-8D7D-4481-BD14-D8E5ABDF74F0'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0E491422-B76A-4B7B-92F3-F7C97652C86A'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E4E57E9A-C711-4997-85E6-E4B9EC3418C3'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2084E343-F761-4FCB-BB3A-52BBB60581D0'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '8E0424D1-5814-4227-A07A-B705CB0BD2B4'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '67977600-8D7D-4481-BD14-D8E5ABDF74F0'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '64ACAE5B-7393-44C1-AEE2-651FB77C5F31'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5FDEB860-CC7F-4DE5-90F2-BDEB521E673F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C8E896CF-7165-41AE-827B-0192F65E457F'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E13CB38F-1FB7-439C-A962-ED7F91DE0BFF'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EF73BC99-09F0-4B92-ABFC-47104016DCC5'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'EF73BC99-09F0-4B92-ABFC-47104016DCC5'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A7C6DFA6-5B73-4766-B650-40DC34511EAB'
               AND AutoUpdateDefaultInView = 1
            

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BE3938FA-821D-4677-B2B3-40B49F6749C4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.ContentProcessRunDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA0E3C91-3614-44A4-ACD0-A3147C734B63' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.AIPromptRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E294C31-7FFB-4E3F-8DAD-B4C0A8CF87E7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.RunType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11951303-1CA3-4F4D-A08B-A0A52C7BBF20' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.ContentProcessRunDetail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Association',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF73BC99-09F0-4B92-ABFC-47104016DCC5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.AIPromptRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Prompt Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51892374-DA40-4F28-A560-39CEDE768AE2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5EFE618-C081-4FD8-82BA-778EC10160E9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Process Run Prompt Runs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '99DFED1E-3A40-4805-94DA-AD53F39DE35A' AND AutoUpdateCategory = 1

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemAID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Duplicate Analysis',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Item A',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F60F12A5-6FB9-4D49-BFCB-64A85F75E66D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemA 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Duplicate Analysis',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Item A Preview',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E0424D1-5814-4227-A07A-B705CB0BD2B4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemBID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Duplicate Analysis',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Item B',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DBD5E19C-AEEB-461F-92DE-5F7FBBA89E6A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ContentItemB 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Duplicate Analysis',
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Item B Preview',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67977600-8D7D-4481-BD14-D8E5ABDF74F0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.SimilarityScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Duplicate Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84991E96-8B03-41BA-B549-8ED8928D0CEA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.DetectionMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Duplicate Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E491422-B76A-4B7B-92F3-F7C97652C86A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution & Review',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4E57E9A-C711-4997-85E6-E4B9EC3418C3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.Resolution 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution & Review',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2084E343-F761-4FCB-BB3A-52BBB60581D0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ResolvedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution & Review',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved By',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A53665F-9104-4F21-840E-DBD063497394' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ResolvedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution & Review',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved By Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64ACAE5B-7393-44C1-AEE2-651FB77C5F31' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ResolvedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution & Review',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9FABE961-C769-4D06-8030-313C693D7758' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '45EEF622-219A-4C97-A601-C7F0F379B128' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1FCC0C51-BE9F-4439-9925-AF5176A05A01' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Item Duplicates.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D3963E6-9BF8-41C4-9F80-2E44BEF1E4AC' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-clone */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-clone', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '48BB6D0F-F836-4A0C-984C-5CE682334818'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('cfd28e05-750d-4999-a238-97c258c62c74', '48BB6D0F-F836-4A0C-984C-5CE682334818', 'FieldCategoryInfo', '{"Duplicate Analysis":{"icon":"fa fa-equals","description":"Details regarding the content items being compared and the similarity metrics used for detection."},"Resolution & Review":{"icon":"fa fa-user-check","description":"Tracking information regarding the verification and resolution of the detected duplicate by a moderator."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps for the record."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('778e4aff-d183-4fdf-b374-1441f087d95e', '48BB6D0F-F836-4A0C-984C-5CE682334818', 'FieldCategoryIcons', '{"Duplicate Analysis":"fa fa-equals","Resolution & Review":"fa fa-user-check","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '48BB6D0F-F836-4A0C-984C-5CE682334818'
      

/* Set categories for 24 fields */

-- UPDATE Entity Field Category Info MJ: Content Items.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BBB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FDB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D9B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentFileTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.URL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'EBB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BD076E0-A5D2-4AF8-B9A7-646D342DBEF4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFA43D7E-C671-48A6-8733-8B75CA8B3CC1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content File Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E13CB38F-1FB7-439C-A962-ED7F91DE0BFF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CDB8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D3B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Checksum 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.ContentType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '064AA602-A3D4-4192-88C4-6F96EFDF0F18' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.Text 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Text',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1B8433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EntityRecordDocumentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFE539D5-8EB6-44F9-8B56-47110E540579' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EntityRecordDocument 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Record Document',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EB399BA-E673-4D31-9A84-937AB383D2F2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EmbeddingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Processing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FDEB860-CC7F-4DE5-90F2-BDEB521E673F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.LastEmbeddedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Processing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F4711B2D-7A6C-46F7-8978-2E780E21B428' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Processing',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A25FDDE3-10F4-40B0-BE93-34AFAFA3C781' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Processing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58DF231C-37A8-4117-B892-64EA2DF12ADA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.TaggingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Processing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8E896CF-7165-41AE-827B-0192F65E457F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Items.LastTaggedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Processing',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '943EDBA1-819E-485C-A83C-CD628CB80219' AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"AI Processing":{"icon":"fa fa-robot","description":"Status and metadata for AI-driven vectorization and automated content tagging"}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"AI Processing":"fa fa-robot"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'FieldCategoryIcons'
            

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
   DisplayName = 'Content Source Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Source Type Name',
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
   DisplayName = 'Content File Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9B7433E-F36B-1410-867F-007B559E242F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ContentFileType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content File Type Name',
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
   GeneratedFormSection = 'Category',
   DisplayName = 'Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '932EE746-F4E7-4036-92B0-733D799C2FBB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F96701F4-70D5-4CB6-A277-6430B51541DE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B31CFFA3-4E1D-4886-8D7D-BE9652343D41' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocumentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Document',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4284A80-BE82-4FBE-B8C0-5A281CD1FFED' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.EntityDocument 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Document Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AC0E8E9-4886-42A8-9515-9203C9EB3B95' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledActionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67648FC9-899D-40CE-873A-FE7E17E099DA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Content Sources.ScheduledAction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scheduled Action Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73DD17EB-C852-49BF-900A-8091FEEE98DB' AND AutoUpdateCategory = 1

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '0EF42A89-2329-4417-A7FA-CABCC41FEAFD'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '3146B46B-2D1B-4F40-B0CB-BFDB589B9CF6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B06DDE6D-D02D-490F-8C76-0EA7A0386228'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2BE5A632-BC34-45E3-931E-A8F26E1A9BF4'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0EF42A89-2329-4417-A7FA-CABCC41FEAFD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3146B46B-2D1B-4F40-B0CB-BFDB589B9CF6'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0EF42A89-2329-4417-A7FA-CABCC41FEAFD'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '3146B46B-2D1B-4F40-B0CB-BFDB589B9CF6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E472EAD3-F41A-4E9E-8DD4-5F6CC1202F19'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8444CF76-8392-4067-A05D-CB15C2BAD467'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3DF6901A-EC14-4F3E-8789-1325BDA244FD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B3390357-0764-4E2C-B738-AF173E6DDFFC'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E472EAD3-F41A-4E9E-8DD4-5F6CC1202F19'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B3390357-0764-4E2C-B738-AF173E6DDFFC'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '4B909919-9DD9-4726-B474-F61C76CA945A'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0BE53519-3BD4-4552-AFB1-4ADA87291E92'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4B909919-9DD9-4726-B474-F61C76CA945A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DBBC8E58-A342-4476-B226-E539D9CFA2AC'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E0AFC7A9-8DE1-4B5E-8D12-1EBEA9A052EB'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '4B909919-9DD9-4726-B474-F61C76CA945A'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'DBBC8E58-A342-4476-B226-E539D9CFA2AC'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'E0AFC7A9-8DE1-4B5E-8D12-1EBEA9A052EB'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '72EAE5BB-3D9B-4840-B15F-36B84E028184'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '2E4317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '674317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.Action 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Log Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF8353B2-2EC8-4A4F-8916-B12A5EB92E97' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.Details 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Log Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Details',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '8275D59B-4A7E-4261-9BFC-4C5E9D8015FC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.PerformedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Log Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Performed By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B45A9709-DC61-4DEB-BB2B-BF633EC3B1F9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.PerformedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Log Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DBBC8E58-A342-4476-B226-E539D9CFA2AC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Associations',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D93DF1E-9AC3-4574-9A0A-ACE2E82E3B6F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Associations',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B909919-9DD9-4726-B474-F61C76CA945A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.RelatedTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Associations',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4978B653-C865-476D-B36B-821711DA1ED9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.RelatedTag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Associations',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E0AFC7A9-8DE1-4B5E-8D12-1EBEA9A052EB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Log ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA0FDB6C-BE39-4465-9E94-C430794E28E3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BE53519-3BD4-4552-AFB1-4ADA87291E92' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Audit Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A28E96C9-2D6B-488D-8872-E18510C1BF8B' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-history', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '475DFF6C-D700-45D9-8892-126E06DC18EC'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('65e6a90d-356f-49e9-bedf-4dc4a41ed5d9', '475DFF6C-D700-45D9-8892-126E06DC18EC', 'FieldCategoryInfo', '{"Audit Log Information":{"icon":"fa fa-info-circle","description":"Details regarding the specific action performed and the user who initiated the change."},"Tag Associations":{"icon":"fa fa-tags","description":"References to the tags involved in the change, including source and destination tags for merges or splits."},"System Metadata":{"icon":"fa fa-cog","description":"System-generated identifiers and timestamps for audit record management."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('cd9cb721-e4b6-42b6-9fe7-7334c4c9cf5f', '475DFF6C-D700-45D9-8892-126E06DC18EC', 'FieldCategoryIcons', '{"Audit Log Information":"fa fa-info-circle","Tag Associations":"fa fa-tags","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '475DFF6C-D700-45D9-8892-126E06DC18EC'
      

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

-- UPDATE Entity Field Category Info MJ: Tags.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '72EAE5BB-3D9B-4840-B15F-36B84E028184' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MergedIntoTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Merged Into Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C67FF975-F08C-46A5-B4AB-73E13AB33BFE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MergedIntoTag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Merged Into Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '365A3F31-543B-4A2A-9AC9-985F2D52F3EF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.RootMergedIntoTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Merged Into Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '036AFF71-913C-4148-9561-4868C38B0508' AND AutoUpdateCategory = 1

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
               VALUES ('d6f73cfa-5ad8-4667-8d8a-8e341ca1ac30', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Tag Lifecycle":{"icon":"fa fa-sync-alt","description":"Management of tag status and consolidation history to maintain data consistency."}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Tag Lifecycle":"fa fa-sync-alt"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '35AB49BE-E38D-43DC-91A7-2E2EFF6CD8F2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F29D3E6-6BBC-4D0A-B6F3-CE81C72187F3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B61C86C-8154-41F0-9901-96D7BEE99A5E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.Query 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E472EAD3-F41A-4E9E-8DD4-5F6CC1202F19' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.Filters 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '15565EF5-5225-43E3-93BE-6D2EF8E95CCE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3390357-0764-4E2C-B738-AF173E6DDFFC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.MinScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Minimum Score',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C5C80A1-2AE0-410D-8241-9404743DD227' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.MaxResults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Maximum Results',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B9628FA-D61E-42F7-AD1B-443B2E15A877' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.NotifyOnNewResults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8444CF76-8392-4067-A05D-CB15C2BAD467' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DF6901A-EC14-4F3E-8789-1325BDA244FD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Knowledge Hub Saved Searches.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BEBFD1E1-A1DA-4489-AB2D-C3EA80E4275F' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-search-plus */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search-plus', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ace7ee12-c9d0-4792-9b98-46b89693e5fb', 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', 'FieldCategoryInfo', '{"Search Definition":{"icon":"fa fa-search","description":"Core search parameters including name, query text, and applied filters."},"Search Settings":{"icon":"fa fa-sliders-h","description":"Configuration for result quality thresholds, limits, and notification preferences."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8578bac1-f0cc-4f8f-8b26-1ee63025846f', 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11', 'FieldCategoryIcons', '{"Search Definition":"fa fa-search","Search Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'BB965BFF-D1CE-4301-AE1D-F15F5CADAD11'
      

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagAID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag A',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F39AC4D2-09D3-4F23-9195-3A4F97E78BB9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagBID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag B',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A5DE98F7-B54B-4D7A-A116-684D670F4E44' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagA 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag A Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0EF42A89-2329-4417-A7FA-CABCC41FEAFD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.TagB 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Pair Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag B Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3146B46B-2D1B-4F40-B0CB-BFDB589B9CF6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.CoOccurrenceCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Occurrence Statistics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Co-occurrence Count',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B06DDE6D-D02D-490F-8C76-0EA7A0386228' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.LastComputedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Occurrence Statistics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Computed',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2BE5A632-BC34-45E3-931E-A8F26E1A9BF4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0EA5DAD9-BCC1-4C54-B4DE-959E27FB9642' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7ECC351-0D08-4F09-B7DA-ED44A43E472B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Co Occurrences.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E044E33-5CC0-49DE-8C76-77A8ED044888' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tags */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-tags', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'B4492451-BFA1-4A67-9799-C82BB98856EB'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('54637a77-6966-4f39-bf95-b0dbc6fb50f9', 'B4492451-BFA1-4A67-9799-C82BB98856EB', 'FieldCategoryInfo', '{"Tag Pair Details":{"icon":"fa fa-link","description":"Identifiers and names for the pair of tags being analyzed."},"Occurrence Statistics":{"icon":"fa fa-chart-bar","description":"Metrics and timestamps related to the frequency of tag co-occurrence."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c846699e-d3cd-45a5-a34b-381aef352533', 'B4492451-BFA1-4A67-9799-C82BB98856EB', 'FieldCategoryIcons', '{"Tag Pair Details":"fa fa-link","Occurrence Statistics":"fa fa-chart-bar","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'B4492451-BFA1-4A67-9799-C82BB98856EB'
      

/* Generated Validation Functions for MJ: Tag Co Occurrences */
-- CHECK constraint for MJ: Tag Co Occurrences @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([TagAID]<[TagBID])', 'public ValidateTagAIDLessThanTagBID(result: ValidationResult) {
	if (this.TagAID != null && this.TagBID != null && !(this.TagAID < this.TagBID)) {
		result.Errors.push(new ValidationErrorInfo(
			"TagAID",
			"The first tag ID must be less than the second tag ID to ensure a consistent pair ordering.",
			this.TagAID,
			ValidationErrorType.Failure
		));
	}
}', 'To maintain data consistency and prevent duplicate entries for the same pair of tags, the first tag ID must always be less than the second tag ID.', 'ValidateTagAIDLessThanTagBID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B4492451-BFA1-4A67-9799-C82BB98856EB');

            

