-- Migration: Autotagger Scope & Governance
--
-- Adds per-tag governance + persisted embedding fields to Tag, plus three new
-- tables that support polymorphic per-tenant tag scoping (TagScope), authored
-- and auto-discovered synonyms (TagSynonym), and a human-in-the-loop review
-- queue for ambiguous / governance-blocked tags (TagSuggestion).
--
-- Notes:
--   - The IsGlobal ⊕ TagScope invariant is enforced in Save() overrides on
--     the entity classes, NOT via DB triggers. The UNIQUE constraint on
--     TagScope (TagID, ScopeEntityID, ScopeRecordID) is the only DB-level
--     guard.
--   - Existing rows default to IsGlobal=1 via the column DEFAULT — no
--     separate backfill UPDATE is needed.
--   - Autotagger configuration knobs (taxonomy mode, thresholds, budgets)
--     remain in the ContentSource.Configuration JSON and are extended via
--     the IContentSourceConfiguration TypeScript interface in metadata/.
--     CodeGen emits the strong type from there.

-- =============================================================================
-- 1. Extend Tag with governance + embedding fields
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.Tag ADD
    IsGlobal              BIT NOT NULL CONSTRAINT DF_Tag_IsGlobal              DEFAULT 1,
    AllowAutoGrow         BIT NOT NULL CONSTRAINT DF_Tag_AllowAutoGrow         DEFAULT 1,
    IsFrozen              BIT NOT NULL CONSTRAINT DF_Tag_IsFrozen              DEFAULT 0,
    MaxChildren           INT NULL,
    MaxDescendantDepth    INT NULL,
    MinWeight             DECIMAL(3,2) NULL,
    RequiresReview        BIT NOT NULL CONSTRAINT DF_Tag_RequiresReview        DEFAULT 0,
    EmbeddingVector       NVARCHAR(MAX) NULL,
    EmbeddingModelID      UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_Tag_EmbeddingModel REFERENCES ${flyway:defaultSchema}.AIModel(ID);
GO

-- =============================================================================
-- 2. TagScope — polymorphic M2M between Tag and any (Entity, Record) scope
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.TagScope (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TagScope_ID DEFAULT (NEWSEQUENTIALID()),
    TagID UNIQUEIDENTIFIER NOT NULL,
    ScopeEntityID UNIQUEIDENTIFIER NOT NULL,
    ScopeRecordID NVARCHAR(450) NOT NULL,
    CONSTRAINT PK_TagScope PRIMARY KEY (ID),
    CONSTRAINT FK_TagScope_Tag FOREIGN KEY (TagID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT FK_TagScope_Entity FOREIGN KEY (ScopeEntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_TagScope_Tag_Entity_Record UNIQUE (TagID, ScopeEntityID, ScopeRecordID)
);
GO

CREATE NONCLUSTERED INDEX IDX_TagScope_Scope_Tag
    ON ${flyway:defaultSchema}.TagScope (ScopeEntityID, ScopeRecordID, TagID);
GO

-- =============================================================================
-- 3. TagSynonym — alternate names that should resolve to a tag
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.TagSynonym (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TagSynonym_ID DEFAULT (NEWSEQUENTIALID()),
    TagID UNIQUEIDENTIFIER NOT NULL,
    Synonym NVARCHAR(255) NOT NULL,
    Source NVARCHAR(20) NOT NULL CONSTRAINT DF_TagSynonym_Source DEFAULT 'Manual',
    CONSTRAINT PK_TagSynonym PRIMARY KEY (ID),
    CONSTRAINT FK_TagSynonym_Tag FOREIGN KEY (TagID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT UQ_TagSynonym_Tag_Synonym UNIQUE (TagID, Synonym),
    CONSTRAINT CK_TagSynonym_Source CHECK (Source IN ('Manual','LLM','Imported','Merged'))
);
GO

-- =============================================================================
-- 4. TagSuggestion — human-in-the-loop review queue
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.TagSuggestion (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TagSuggestion_ID DEFAULT (NEWSEQUENTIALID()),
    ProposedName NVARCHAR(255) NOT NULL,
    ProposedParentID UNIQUEIDENTIFIER NULL,
    BestMatchTagID UNIQUEIDENTIFIER NULL,
    BestMatchScore DECIMAL(4,3) NULL,
    Reason NVARCHAR(50) NOT NULL,
    SourceContentItemID UNIQUEIDENTIFIER NULL,
    SourceContentSourceID UNIQUEIDENTIFIER NULL,
    SourceText NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_TagSuggestion_Status DEFAULT 'Pending',
    ResolvedTagID UNIQUEIDENTIFIER NULL,
    ReviewedByUserID UNIQUEIDENTIFIER NULL,
    ReviewedAt DATETIMEOFFSET NULL,
    ReviewerNotes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_TagSuggestion PRIMARY KEY (ID),
    CONSTRAINT FK_TagSuggestion_ProposedParent FOREIGN KEY (ProposedParentID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT FK_TagSuggestion_BestMatch FOREIGN KEY (BestMatchTagID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT FK_TagSuggestion_Resolved FOREIGN KEY (ResolvedTagID)
        REFERENCES ${flyway:defaultSchema}.Tag(ID),
    CONSTRAINT FK_TagSuggestion_ContentItem FOREIGN KEY (SourceContentItemID)
        REFERENCES ${flyway:defaultSchema}.ContentItem(ID),
    CONSTRAINT FK_TagSuggestion_ContentSource FOREIGN KEY (SourceContentSourceID)
        REFERENCES ${flyway:defaultSchema}.ContentSource(ID),
    CONSTRAINT FK_TagSuggestion_ReviewedByUser FOREIGN KEY (ReviewedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_TagSuggestion_Status CHECK (Status IN ('Pending','Approved','Rejected','Merged'))
);
GO

-- =============================================================================
-- 5. Extended properties (descriptions for CodeGen)
-- =============================================================================

-- Tag (new columns)

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, the tag is visible to every tenant/scope. When 0, the tag is only visible to the (Entity, Record) pairs listed in TagScope. Cannot be set together with TagScope rows — enforced in entity Save() override.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'IsGlobal';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, the autotagger may auto-create new child tags under this node when running in AutoGrow or FreeFlow mode. When 0, new children must come through the TagSuggestion review queue.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'AllowAutoGrow';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this subtree is locked: no new children may be created under this node or any descendant, regardless of taxonomy mode. Existing children remain editable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'IsFrozen';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional cap on the number of direct children allowed under this tag. NULL = unlimited. Auto-grow is blocked once this cap is reached and routed to the TagSuggestion queue.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'MaxChildren';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional cap on the depth of the subtree rooted at this tag. NULL = unlimited. 0 = leaf-only (no children at all). Enforced via ancestor walk during auto-grow.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'MaxDescendantDepth';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional minimum classifier confidence (0.00-1.00) required for this tag to be applied. Items below this floor are routed to the TagSuggestion queue instead of being tagged.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'MinWeight';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, every classifier-applied use of this tag is routed to the TagSuggestion queue for human approval before being persisted as a ContentItemTag → TaggedItem.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'RequiresReview';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON-encoded numeric vector representing the tag''s embedding under the model identified by EmbeddingModelID. Refreshed automatically on Save() when Name or Description changes. Used to seed the in-memory tag vector cache without a cold-start LLM round-trip.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'EmbeddingVector';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AI model whose embedding produced EmbeddingVector. When the configured tag-embedding model differs from this value, the cached vector is treated as stale and recomputed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Tag',
    @level2type = N'COLUMN', @level2name = N'EmbeddingModelID';
GO

-- TagScope

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Polymorphic junction binding a Tag to one or more (Entity, Record) scope rows. A Tag with one or more TagScope rows is only visible inside those scopes; a Tag with no rows AND IsGlobal=1 is visible everywhere. Mirrors the shape of TaggedItem.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagScope';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Tag whose visibility this row constrains.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagScope',
    @level2type = N'COLUMN', @level2name = N'TagID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Entity that the scope record belongs to (e.g., Companies, AI Agents). Combined with ScopeRecordID identifies the specific tenant or context that may see the tag.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagScope',
    @level2type = N'COLUMN', @level2name = N'ScopeEntityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key value of the scope record. Stored as NVARCHAR(450) to match the polymorphic RecordID convention used by TaggedItem.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagScope',
    @level2type = N'COLUMN', @level2name = N'ScopeRecordID';
GO

-- TagSynonym

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Alternate names that should resolve to a Tag during autotagging. Consulted before exact/fuzzy/semantic match tiers in TagEngine.ResolveTag.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSynonym';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Tag this synonym maps to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSynonym',
    @level2type = N'COLUMN', @level2name = N'TagID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The alternate name that should resolve to the Tag. Case-insensitive; uniqueness is enforced per-Tag via UQ_TagSynonym_Tag_Synonym.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSynonym',
    @level2type = N'COLUMN', @level2name = N'Synonym';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How this synonym was introduced. Manual = admin-authored; LLM = suggested by an LLM run; Imported = bulk-loaded; Merged = inherited from a tag merged into this one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSynonym',
    @level2type = N'COLUMN', @level2name = N'Source';
GO

-- TagSuggestion

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-in-the-loop review queue for tag changes the autotagger could not commit autonomously: ambiguous matches, governance-blocked auto-grows, low-usage deprecation candidates, and merge candidates from co-occurrence analysis.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The proposed tag name as seen by the classifier or analyzer.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'ProposedName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tag under which the suggestion would be created if approved as a new tag. NULL = root.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'ProposedParentID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When non-null, the existing Tag the system believes is the closest match. The reviewer may accept this as a merge target instead of creating a new tag.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'BestMatchTagID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cosine similarity score (0.000-1.000) between the proposed name embedding and BestMatchTagID''s embedding, when applicable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'BestMatchScore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why this suggestion was created. Free-form NVARCHAR for forward compatibility; conventional values include ConstrainedMode, BelowThreshold, ParentFrozen, AutoGrowDisabled, MaxChildrenExceeded, MaxDepthExceeded, BelowMinWeight, RequiresReview, MergeCandidate, LowUsage, WideNode.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'Reason';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ContentItem that triggered this suggestion, when item-level. NULL for taxonomy-level suggestions (merge candidates, low-usage alerts).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'SourceContentItemID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ContentSource that triggered this suggestion, when source-attributable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'SourceContentSourceID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional snippet of source text that prompted the suggestion. Useful for reviewer context.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'SourceText';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pending = awaiting review; Approved = accepted as a new tag; Merged = accepted as a merge into BestMatchTagID; Rejected = dismissed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When Approved or Merged, points to the resulting Tag (the new tag for Approved, the merge target for Merged).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'ResolvedTagID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who took action on this suggestion.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'ReviewedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the review action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'ReviewedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form notes captured at review time. Useful for rejection rationale or merge decisions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSuggestion',
    @level2type = N'COLUMN', @level2name = N'ReviewerNotes';
GO

























































































-- CODEGEN RUN
/* SQL generated to create new entity MJ: Tag Scopes */

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
         [AllowUserSearchAPI],
         [AllowCaching]
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
         'ea41de76-f03f-4335-a98d-facfa37afb1c',
         'MJ: Tag Scopes',
         'Tag Scopes',
         'Polymorphic junction binding a Tag to one or more (Entity, Record) scope rows. A Tag with one or more TagScope rows is only visible inside those scopes; a Tag with no rows AND IsGlobal=1 is visible everywhere. Mirrors the shape of TaggedItem.',
         NULL,
         'TagScope',
         'vwTagScopes',
         '${flyway:defaultSchema}',
         1,
         1,
         1
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
   

/* SQL generated to add new entity MJ: Tag Scopes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ea41de76-f03f-4335-a98d-facfa37afb1c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Scopes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ea41de76-f03f-4335-a98d-facfa37afb1c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Scopes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ea41de76-f03f-4335-a98d-facfa37afb1c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Scopes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ea41de76-f03f-4335-a98d-facfa37afb1c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Tag Synonyms */

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
         [AllowUserSearchAPI],
         [AllowCaching]
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
         'fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0',
         'MJ: Tag Synonyms',
         'Tag Synonyms',
         'Alternate names that should resolve to a Tag during autotagging. Consulted before exact/fuzzy/semantic match tiers in TagEngine.ResolveTag.',
         NULL,
         'TagSynonym',
         'vwTagSynonyms',
         '${flyway:defaultSchema}',
         1,
         1,
         1
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
   

/* SQL generated to add new entity MJ: Tag Synonyms to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Synonyms for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Synonyms for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Synonyms for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fe0d485e-8c3f-4fe0-bd07-ef81e8f14ce0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Tag Suggestions */

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
         [AllowUserSearchAPI],
         [AllowCaching]
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
         'bcf03e3b-d2b2-4557-aceb-95b18495f451',
         'MJ: Tag Suggestions',
         'Tag Suggestions',
         'Human-in-the-loop review queue for tag changes the autotagger could not commit autonomously: ambiguous matches, governance-blocked auto-grows, low-usage deprecation candidates, and merge candidates from co-occurrence analysis.',
         NULL,
         'TagSuggestion',
         'vwTagSuggestions',
         '${flyway:defaultSchema}',
         1,
         1,
         1
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
   

/* SQL generated to add new entity MJ: Tag Suggestions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bcf03e3b-d2b2-4557-aceb-95b18495f451', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Suggestions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bcf03e3b-d2b2-4557-aceb-95b18495f451', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Suggestions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bcf03e3b-d2b2-4557-aceb-95b18495f451', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Tag Suggestions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bcf03e3b-d2b2-4557-aceb-95b18495f451', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[TagSuggestion] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
UPDATE [${flyway:defaultSchema}].[TagSuggestion] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[TagSuggestion] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[TagSuggestion] ADD CONSTRAINT [DF___mj_TagSuggestion___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[TagSuggestion] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
UPDATE [${flyway:defaultSchema}].[TagSuggestion] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[TagSuggestion] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSuggestion */
ALTER TABLE [${flyway:defaultSchema}].[TagSuggestion] ADD CONSTRAINT [DF___mj_TagSuggestion___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSynonym */
ALTER TABLE [${flyway:defaultSchema}].[TagSynonym] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSynonym */
UPDATE [${flyway:defaultSchema}].[TagSynonym] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSynonym */
ALTER TABLE [${flyway:defaultSchema}].[TagSynonym] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagSynonym */
ALTER TABLE [${flyway:defaultSchema}].[TagSynonym] ADD CONSTRAINT [DF___mj_TagSynonym___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSynonym */
ALTER TABLE [${flyway:defaultSchema}].[TagSynonym] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSynonym */
UPDATE [${flyway:defaultSchema}].[TagSynonym] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSynonym */
ALTER TABLE [${flyway:defaultSchema}].[TagSynonym] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagSynonym */
ALTER TABLE [${flyway:defaultSchema}].[TagSynonym] ADD CONSTRAINT [DF___mj_TagSynonym___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagScope */
ALTER TABLE [${flyway:defaultSchema}].[TagScope] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagScope */
UPDATE [${flyway:defaultSchema}].[TagScope] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagScope */
ALTER TABLE [${flyway:defaultSchema}].[TagScope] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.TagScope */
ALTER TABLE [${flyway:defaultSchema}].[TagScope] ADD CONSTRAINT [DF___mj_TagScope___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagScope */
ALTER TABLE [${flyway:defaultSchema}].[TagScope] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagScope */
UPDATE [${flyway:defaultSchema}].[TagScope] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagScope */
ALTER TABLE [${flyway:defaultSchema}].[TagScope] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.TagScope */
ALTER TABLE [${flyway:defaultSchema}].[TagScope] ADD CONSTRAINT [DF___mj_TagScope___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e4149a0-d01d-48fd-9e1b-8764ebc4409d' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsGlobal')) BEGIN
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
            '8e4149a0-d01d-48fd-9e1b-8764ebc4409d',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100032,
            'IsGlobal',
            'Is Global',
            'When 1, the tag is visible to every tenant/scope. When 0, the tag is only visible to the (Entity, Record) pairs listed in TagScope. Cannot be set together with TagScope rows — enforced in entity Save() override.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '188a03e5-163f-4305-b05d-a1cafc786695' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AllowAutoGrow')) BEGIN
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
            '188a03e5-163f-4305-b05d-a1cafc786695',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100033,
            'AllowAutoGrow',
            'Allow Auto Grow',
            'When 1, the autotagger may auto-create new child tags under this node when running in AutoGrow or FreeFlow mode. When 0, new children must come through the TagSuggestion review queue.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06c53ad9-6e47-40f6-8a54-22b08ffac96e' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsFrozen')) BEGIN
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
            '06c53ad9-6e47-40f6-8a54-22b08ffac96e',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100034,
            'IsFrozen',
            'Is Frozen',
            'When 1, this subtree is locked: no new children may be created under this node or any descendant, regardless of taxonomy mode. Existing children remain editable.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40c2e9d8-c6f6-4060-b56b-88abbc8e0698' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MaxChildren')) BEGIN
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
            '40c2e9d8-c6f6-4060-b56b-88abbc8e0698',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100035,
            'MaxChildren',
            'Max Children',
            'Optional cap on the number of direct children allowed under this tag. NULL = unlimited. Auto-grow is blocked once this cap is reached and routed to the TagSuggestion queue.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b752f3f4-1d32-4645-925f-28e6d6c122c0' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MaxDescendantDepth')) BEGIN
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
            'b752f3f4-1d32-4645-925f-28e6d6c122c0',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100036,
            'MaxDescendantDepth',
            'Max Descendant Depth',
            'Optional cap on the depth of the subtree rooted at this tag. NULL = unlimited. 0 = leaf-only (no children at all). Enforced via ancestor walk during auto-grow.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e7ed65e-41c6-4c6d-8659-52cfff1b46dd' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MinWeight')) BEGIN
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
            '9e7ed65e-41c6-4c6d-8659-52cfff1b46dd',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100037,
            'MinWeight',
            'Min Weight',
            'Optional minimum classifier confidence (0.00-1.00) required for this tag to be applied. Items below this floor are routed to the TagSuggestion queue instead of being tagged.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e54b8418-2042-44d3-acdd-00e34d6db818' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RequiresReview')) BEGIN
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
            'e54b8418-2042-44d3-acdd-00e34d6db818',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100038,
            'RequiresReview',
            'Requires Review',
            'When 1, every classifier-applied use of this tag is routed to the TagSuggestion queue for human approval before being persisted as a ContentItemTag → TaggedItem.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32bd0c45-ce4c-41c5-8f42-9075a36b27ae' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EmbeddingVector')) BEGIN
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
            '32bd0c45-ce4c-41c5-8f42-9075a36b27ae',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100039,
            'EmbeddingVector',
            'Embedding Vector',
            'JSON-encoded numeric vector representing the tag''s embedding under the model identified by EmbeddingModelID. Refreshed automatically on Save() when Name or Description changes. Used to seed the in-memory tag vector cache without a cold-start LLM round-trip.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2681aeac-3d38-478e-854b-9c0d271279f8' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EmbeddingModelID')) BEGIN
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
            '2681aeac-3d38-478e-854b-9c0d271279f8',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100040,
            'EmbeddingModelID',
            'Embedding Model ID',
            'AI model whose embedding produced EmbeddingVector. When the configured tag-embedding model differs from this value, the cached vector is treated as stale and recomputed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac912468-b579-46ce-a7f7-cb110aa54789' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ID')) BEGIN
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
            'ac912468-b579-46ce-a7f7-cb110aa54789',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25782ccd-889e-433d-b2cc-c2a0e2e2be5d' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ProposedName')) BEGIN
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
            '25782ccd-889e-433d-b2cc-c2a0e2e2be5d',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100002,
            'ProposedName',
            'Proposed Name',
            'The proposed tag name as seen by the classifier or analyzer.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2cba41b4-7ca6-43b7-b854-8f1b5c9d8413' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ProposedParentID')) BEGIN
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
            '2cba41b4-7ca6-43b7-b854-8f1b5c9d8413',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100003,
            'ProposedParentID',
            'Proposed Parent ID',
            'Tag under which the suggestion would be created if approved as a new tag. NULL = root.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd9dfcf44-e225-4ec2-a08c-c2c1ede9565d' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'BestMatchTagID')) BEGIN
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
            'd9dfcf44-e225-4ec2-a08c-c2c1ede9565d',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100004,
            'BestMatchTagID',
            'Best Match Tag ID',
            'When non-null, the existing Tag the system believes is the closest match. The reviewer may accept this as a merge target instead of creating a new tag.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14685a97-7362-4755-847b-3c6043d0967f' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'BestMatchScore')) BEGIN
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
            '14685a97-7362-4755-847b-3c6043d0967f',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100005,
            'BestMatchScore',
            'Best Match Score',
            'Cosine similarity score (0.000-1.000) between the proposed name embedding and BestMatchTagID''s embedding, when applicable.',
            'decimal',
            5,
            4,
            3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83526f85-6adc-40bd-a2df-ac433f616f9b' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'Reason')) BEGIN
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
            '83526f85-6adc-40bd-a2df-ac433f616f9b',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100006,
            'Reason',
            'Reason',
            'Why this suggestion was created. Free-form NVARCHAR for forward compatibility; conventional values include ConstrainedMode, BelowThreshold, ParentFrozen, AutoGrowDisabled, MaxChildrenExceeded, MaxDepthExceeded, BelowMinWeight, RequiresReview, MergeCandidate, LowUsage, WideNode.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbab09cd-db94-4db7-a3c2-b783247e0e21' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'SourceContentItemID')) BEGIN
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
            'fbab09cd-db94-4db7-a3c2-b783247e0e21',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100007,
            'SourceContentItemID',
            'Source Content Item ID',
            'ContentItem that triggered this suggestion, when item-level. NULL for taxonomy-level suggestions (merge candidates, low-usage alerts).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bdfb3e2-f43e-44ab-ad6b-516c47c12e9b' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'SourceContentSourceID')) BEGIN
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
            '3bdfb3e2-f43e-44ab-ad6b-516c47c12e9b',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100008,
            'SourceContentSourceID',
            'Source Content Source ID',
            'ContentSource that triggered this suggestion, when source-attributable.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '960c7bea-30a6-4d48-845a-065d8a6275be' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'SourceText')) BEGIN
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
            '960c7bea-30a6-4d48-845a-065d8a6275be',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100009,
            'SourceText',
            'Source Text',
            'Optional snippet of source text that prompted the suggestion. Useful for reviewer context.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef060f94-efb2-4057-af53-4b13280c307c' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'Status')) BEGIN
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
            'ef060f94-efb2-4057-af53-4b13280c307c',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100010,
            'Status',
            'Status',
            'Pending = awaiting review; Approved = accepted as a new tag; Merged = accepted as a merge into BestMatchTagID; Rejected = dismissed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d6d17da-da7f-43f1-90f1-424f908448d9' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ResolvedTagID')) BEGIN
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
            '9d6d17da-da7f-43f1-90f1-424f908448d9',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100011,
            'ResolvedTagID',
            'Resolved Tag ID',
            'When Approved or Merged, points to the resulting Tag (the new tag for Approved, the merge target for Merged).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5357c14-3b81-4a98-9e1d-516b56248907' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ReviewedByUserID')) BEGIN
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
            'd5357c14-3b81-4a98-9e1d-516b56248907',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100012,
            'ReviewedByUserID',
            'Reviewed By User ID',
            'User who took action on this suggestion.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4fd8477-e9b1-4156-8b34-0d03d2e332dc' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ReviewedAt')) BEGIN
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
            'c4fd8477-e9b1-4156-8b34-0d03d2e332dc',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100013,
            'ReviewedAt',
            'Reviewed At',
            'Timestamp of the review action.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a894cca-6bce-4f45-ada9-d750813a7462' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ReviewerNotes')) BEGIN
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
            '7a894cca-6bce-4f45-ada9-d750813a7462',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100014,
            'ReviewerNotes',
            'Reviewer Notes',
            'Free-form notes captured at review time. Useful for rejection rationale or merge decisions.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '371b3a78-7a29-4c93-99e5-e88e8f243c63' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = '__mj_CreatedAt')) BEGIN
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
            '371b3a78-7a29-4c93-99e5-e88e8f243c63',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ad03eff-39f3-4227-9260-bb2e3118f6fc' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6ad03eff-39f3-4227-9260-bb2e3118f6fc',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ba484dc-192c-4d78-bda6-f05cc8fb9565' OR (EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND Name = 'ID')) BEGIN
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
            '6ba484dc-192c-4d78-bda6-f05cc8fb9565',
            'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- Entity: MJ: Tag Synonyms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de84807f-a1a6-40ed-a154-bc7b7f59fad3' OR (EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND Name = 'TagID')) BEGIN
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
            'de84807f-a1a6-40ed-a154-bc7b7f59fad3',
            'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- Entity: MJ: Tag Synonyms
            100002,
            'TagID',
            'Tag ID',
            'The Tag this synonym maps to.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f95e7337-1169-4d05-b6ec-0a14a7626e21' OR (EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND Name = 'Synonym')) BEGIN
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
            'f95e7337-1169-4d05-b6ec-0a14a7626e21',
            'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- Entity: MJ: Tag Synonyms
            100003,
            'Synonym',
            'Synonym',
            'The alternate name that should resolve to the Tag. Case-insensitive; uniqueness is enforced per-Tag via UQ_TagSynonym_Tag_Synonym.',
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
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b50a4543-d60f-4440-9587-cb61c449d06a' OR (EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND Name = 'Source')) BEGIN
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
            'b50a4543-d60f-4440-9587-cb61c449d06a',
            'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- Entity: MJ: Tag Synonyms
            100004,
            'Source',
            'Source',
            'How this synonym was introduced. Manual = admin-authored; LLM = suggested by an LLM run; Imported = bulk-loaded; Merged = inherited from a tag merged into this one.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Manual',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fbd3c83-dc1c-41b6-9bf2-bbe89dc42901' OR (EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2fbd3c83-dc1c-41b6-9bf2-bbe89dc42901',
            'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- Entity: MJ: Tag Synonyms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ae65fca-b822-44f1-ac56-70606e6cc190' OR (EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4ae65fca-b822-44f1-ac56-70606e6cc190',
            'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- Entity: MJ: Tag Synonyms
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b3123f9-9973-4c70-9b0b-7156a6bd57f2' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = 'ID')) BEGIN
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
            '8b3123f9-9973-4c70-9b0b-7156a6bd57f2',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '78a7d431-93eb-485a-9667-e2ce0eb31f2a' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = 'TagID')) BEGIN
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
            '78a7d431-93eb-485a-9667-e2ce0eb31f2a',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
            100002,
            'TagID',
            'Tag ID',
            'The Tag whose visibility this row constrains.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '815c5c75-ecde-4090-bc99-615c6b209532' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = 'ScopeEntityID')) BEGIN
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
            '815c5c75-ecde-4090-bc99-615c6b209532',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
            100003,
            'ScopeEntityID',
            'Scope Entity ID',
            'Entity that the scope record belongs to (e.g., Companies, AI Agents). Combined with ScopeRecordID identifies the specific tenant or context that may see the tag.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7366be86-000c-44e3-8b16-fc97fbd8b586' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = 'ScopeRecordID')) BEGIN
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
            '7366be86-000c-44e3-8b16-fc97fbd8b586',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
            100004,
            'ScopeRecordID',
            'Scope Record ID',
            'Primary key value of the scope record. Stored as NVARCHAR(450) to match the polymorphic RecordID convention used by TaggedItem.',
            'nvarchar',
            900,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73fa4eef-db95-469d-92b0-3318a9c2663d' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = '__mj_CreatedAt')) BEGIN
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
            '73fa4eef-db95-469d-92b0-3318a9c2663d',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b925e50c-aa27-4c58-9c3a-9625e17989e8' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'b925e50c-aa27-4c58-9c3a-9625e17989e8',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
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

/* SQL text to insert entity field value with ID 3c7064ab-4eda-41fb-8c07-dd58edb4717c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c7064ab-4eda-41fb-8c07-dd58edb4717c', 'B50A4543-D60F-4440-9587-CB61C449D06A', 1, 'Imported', 'Imported', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 9a3dd414-b2cb-4629-949f-6fd2120b8953 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9a3dd414-b2cb-4629-949f-6fd2120b8953', 'B50A4543-D60F-4440-9587-CB61C449D06A', 2, 'LLM', 'LLM', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d55f6a3c-134e-4617-9d01-620a3c46acea */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d55f6a3c-134e-4617-9d01-620a3c46acea', 'B50A4543-D60F-4440-9587-CB61C449D06A', 3, 'Manual', 'Manual', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 372b49cc-6343-4bf4-9169-e9cc469a6b54 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('372b49cc-6343-4bf4-9169-e9cc469a6b54', 'B50A4543-D60F-4440-9587-CB61C449D06A', 4, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID B50A4543-D60F-4440-9587-CB61C449D06A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B50A4543-D60F-4440-9587-CB61C449D06A'

/* SQL text to insert entity field value with ID 245e811c-bf52-4e50-a36a-b2932cf0f49a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('245e811c-bf52-4e50-a36a-b2932cf0f49a', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID b2f8e7e8-7f9d-41f8-8070-cc9db200022c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b2f8e7e8-7f9d-41f8-8070-cc9db200022c', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 2, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID af8c46ec-29aa-46f4-b842-5d9abf5a97ba */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('af8c46ec-29aa-46f4-b842-5d9abf5a97ba', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 84145603-0af1-4c3f-9a3d-44160635096d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('84145603-0af1-4c3f-9a3d-44160635096d', 'EF060F94-EFB2-4057-AF53-4B13280C307C', 4, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID EF060F94-EFB2-4057-AF53-4B13280C307C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='EF060F94-EFB2-4057-AF53-4B13280C307C'


/* Create Entity Relationship: MJ: Entities -> MJ: Tag Scopes (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c75df88d-1abc-43df-8a1a-fbccdcb2e7df'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c75df88d-1abc-43df-8a1a-fbccdcb2e7df', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'ScopeEntityID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: Tag Suggestions (One To Many via ReviewedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dda5c2b7-8a10-4ebd-baf0-cae93df7f1e7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dda5c2b7-8a10-4ebd-baf0-cae93df7f1e7', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'ReviewedByUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: AI Models -> MJ: Tags (One To Many via EmbeddingModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd16b8236-75fd-4639-9d05-724e390f826b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d16b8236-75fd-4639-9d05-724e390f826b', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'EmbeddingModelID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Tags -> MJ: Tag Suggestions (One To Many via ProposedParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '00791f8d-289a-4a54-8f88-d87711876dbb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('00791f8d-289a-4a54-8f88-d87711876dbb', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'ProposedParentID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Suggestions (One To Many via BestMatchTagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '522d3a92-5e99-4036-b5ff-843706b4ad84'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('522d3a92-5e99-4036-b5ff-843706b4ad84', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'BestMatchTagID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Suggestions (One To Many via ResolvedTagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f27279f6-af3c-4b01-ba65-1406f16b3585'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f27279f6-af3c-4b01-ba65-1406f16b3585', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'ResolvedTagID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Tags -> MJ: Tag Synonyms (One To Many via TagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a5e149ca-8d5d-4322-8c47-1fc850be7b90'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a5e149ca-8d5d-4322-8c47-1fc850be7b90', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', 'TagID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Tags -> MJ: Tag Scopes (One To Many via TagID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fe79889c-9f50-42aa-be5c-ce9e6e6e4f78'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fe79889c-9f50-42aa-be5c-ce9e6e6e4f78', '0C248F34-2837-EF11-86D4-6045BDEE16E6', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'TagID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Sources -> MJ: Tag Suggestions (One To Many via SourceContentSourceID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '882dd9f5-6e18-4a0c-a9d3-90d601f798b1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('882dd9f5-6e18-4a0c-a9d3-90d601f798b1', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'SourceContentSourceID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Content Items -> MJ: Tag Suggestions (One To Many via SourceContentItemID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7885dbf6-7263-4470-ba4d-0c4c801a622b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7885dbf6-7263-4470-ba4d-0c4c801a622b', 'B693AD50-0E66-EF11-A752-C0A5E8ACCB22', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'SourceContentItemID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for TagScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TagID in table TagScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagScope_TagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagScope_TagID ON [${flyway:defaultSchema}].[TagScope] ([TagID]);

-- Index for foreign key ScopeEntityID in table TagScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagScope_ScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagScope_ScopeEntityID ON [${flyway:defaultSchema}].[TagScope] ([ScopeEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 78A7D431-93EB-485A-9667-E2CE0EB31F2A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='78A7D431-93EB-485A-9667-E2CE0EB31F2A', @RelatedEntityNameFieldMap='Tag'

/* Index for Foreign Keys for TagSuggestion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProposedParentID in table TagSuggestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagSuggestion_ProposedParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagSuggestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagSuggestion_ProposedParentID ON [${flyway:defaultSchema}].[TagSuggestion] ([ProposedParentID]);

-- Index for foreign key BestMatchTagID in table TagSuggestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagSuggestion_BestMatchTagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagSuggestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagSuggestion_BestMatchTagID ON [${flyway:defaultSchema}].[TagSuggestion] ([BestMatchTagID]);

-- Index for foreign key SourceContentItemID in table TagSuggestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagSuggestion_SourceContentItemID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagSuggestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagSuggestion_SourceContentItemID ON [${flyway:defaultSchema}].[TagSuggestion] ([SourceContentItemID]);

-- Index for foreign key SourceContentSourceID in table TagSuggestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagSuggestion_SourceContentSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagSuggestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagSuggestion_SourceContentSourceID ON [${flyway:defaultSchema}].[TagSuggestion] ([SourceContentSourceID]);

-- Index for foreign key ResolvedTagID in table TagSuggestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagSuggestion_ResolvedTagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagSuggestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagSuggestion_ResolvedTagID ON [${flyway:defaultSchema}].[TagSuggestion] ([ResolvedTagID]);

-- Index for foreign key ReviewedByUserID in table TagSuggestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagSuggestion_ReviewedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagSuggestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagSuggestion_ReviewedByUserID ON [${flyway:defaultSchema}].[TagSuggestion] ([ReviewedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 2CBA41B4-7CA6-43B7-B854-8F1B5C9D8413 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2CBA41B4-7CA6-43B7-B854-8F1B5C9D8413', @RelatedEntityNameFieldMap='ProposedParent'

/* Index for Foreign Keys for TagSynonym */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TagID in table TagSynonym
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_TagSynonym_TagID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[TagSynonym]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_TagSynonym_TagID ON [${flyway:defaultSchema}].[TagSynonym] ([TagID]);

/* SQL text to update entity field related entity name field map for entity field ID DE84807F-A1A6-40ED-A154-BC7B7F59FAD3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DE84807F-A1A6-40ED-A154-BC7B7F59FAD3', @RelatedEntityNameFieldMap='Tag'

/* SQL text to update entity field related entity name field map for entity field ID 815C5C75-ECDE-4090-BC99-615C6B209532 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='815C5C75-ECDE-4090-BC99-615C6B209532', @RelatedEntityNameFieldMap='ScopeEntity'

/* Base View SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: vwTagSynonyms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tag Synonyms
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TagSynonym
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTagSynonyms]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTagSynonyms];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTagSynonyms]
AS
SELECT
    t.*,
    MJTag_TagID.[Name] AS [Tag]
FROM
    [${flyway:defaultSchema}].[TagSynonym] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagID
  ON
    [t].[TagID] = MJTag_TagID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTagSynonyms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: Permissions for vwTagSynonyms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTagSynonyms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: spCreateTagSynonym
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagSynonym
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTagSynonym]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTagSynonym];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTagSynonym]
    @ID uniqueidentifier = NULL,
    @TagID uniqueidentifier,
    @Synonym nvarchar(255),
    @Source nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TagSynonym]
            (
                [ID],
                [TagID],
                [Synonym],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TagID,
                @Synonym,
                ISNULL(@Source, 'Manual')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TagSynonym]
            (
                [TagID],
                [Synonym],
                [Source]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TagID,
                @Synonym,
                ISNULL(@Source, 'Manual')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTagSynonyms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagSynonym] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tag Synonyms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagSynonym] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: spUpdateTagSynonym
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagSynonym
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTagSynonym]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTagSynonym];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTagSynonym]
    @ID uniqueidentifier,
    @TagID uniqueidentifier,
    @Synonym nvarchar(255),
    @Source nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagSynonym]
    SET
        [TagID] = @TagID,
        [Synonym] = @Synonym,
        [Source] = @Source
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTagSynonyms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTagSynonyms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagSynonym] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TagSynonym table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTagSynonym]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTagSynonym];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTagSynonym
ON [${flyway:defaultSchema}].[TagSynonym]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagSynonym]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TagSynonym] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tag Synonyms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagSynonym] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tag Synonyms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Synonyms
-- Item: spDeleteTagSynonym
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagSynonym
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTagSynonym]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTagSynonym];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTagSynonym]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TagSynonym]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagSynonym] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tag Synonyms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagSynonym] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID D9DFCF44-E225-4EC2-A08C-C2C1EDE9565D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D9DFCF44-E225-4EC2-A08C-C2C1EDE9565D', @RelatedEntityNameFieldMap='BestMatchTag'

/* Base View SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: vwTagScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tag Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TagScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTagScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTagScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTagScopes]
AS
SELECT
    t.*,
    MJTag_TagID.[Name] AS [Tag],
    MJEntity_ScopeEntityID.[Name] AS [ScopeEntity]
FROM
    [${flyway:defaultSchema}].[TagScope] AS t
INNER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_TagID
  ON
    [t].[TagID] = MJTag_TagID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_ScopeEntityID
  ON
    [t].[ScopeEntityID] = MJEntity_ScopeEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTagScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: Permissions for vwTagScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTagScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: spCreateTagScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTagScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTagScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTagScope]
    @ID uniqueidentifier = NULL,
    @TagID uniqueidentifier,
    @ScopeEntityID uniqueidentifier,
    @ScopeRecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TagScope]
            (
                [ID],
                [TagID],
                [ScopeEntityID],
                [ScopeRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TagID,
                @ScopeEntityID,
                @ScopeRecordID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TagScope]
            (
                [TagID],
                [ScopeEntityID],
                [ScopeRecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TagID,
                @ScopeEntityID,
                @ScopeRecordID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTagScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagScope] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tag Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagScope] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: spUpdateTagScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTagScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTagScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTagScope]
    @ID uniqueidentifier,
    @TagID uniqueidentifier,
    @ScopeEntityID uniqueidentifier,
    @ScopeRecordID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagScope]
    SET
        [TagID] = @TagID,
        [ScopeEntityID] = @ScopeEntityID,
        [ScopeRecordID] = @ScopeRecordID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTagScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTagScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TagScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTagScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTagScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTagScope
ON [${flyway:defaultSchema}].[TagScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TagScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tag Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagScope] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tag Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Scopes
-- Item: spDeleteTagScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTagScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTagScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTagScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TagScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagScope] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tag Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagScope] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID FBAB09CD-DB94-4DB7-A3C2-B783247E0E21 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FBAB09CD-DB94-4DB7-A3C2-B783247E0E21', @RelatedEntityNameFieldMap='SourceContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 3BDFB3E2-F43E-44AB-AD6B-516C47C12E9B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3BDFB3E2-F43E-44AB-AD6B-516C47C12E9B', @RelatedEntityNameFieldMap='SourceContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 9D6D17DA-DA7F-43F1-90F1-424F908448D9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9D6D17DA-DA7F-43F1-90F1-424F908448D9', @RelatedEntityNameFieldMap='ResolvedTag'

/* SQL text to update entity field related entity name field map for entity field ID D5357C14-3B81-4A98-9E1D-516B56248907 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D5357C14-3B81-4A98-9E1D-516B56248907', @RelatedEntityNameFieldMap='ReviewedByUser'

/* Base View SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: vwTagSuggestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tag Suggestions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TagSuggestion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTagSuggestions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTagSuggestions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTagSuggestions]
AS
SELECT
    t.*,
    MJTag_ProposedParentID.[Name] AS [ProposedParent],
    MJTag_BestMatchTagID.[Name] AS [BestMatchTag],
    MJContentItem_SourceContentItemID.[Name] AS [SourceContentItem],
    MJContentSource_SourceContentSourceID.[Name] AS [SourceContentSource],
    MJTag_ResolvedTagID.[Name] AS [ResolvedTag],
    MJUser_ReviewedByUserID.[Name] AS [ReviewedByUser]
FROM
    [${flyway:defaultSchema}].[TagSuggestion] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_ProposedParentID
  ON
    [t].[ProposedParentID] = MJTag_ProposedParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_BestMatchTagID
  ON
    [t].[BestMatchTagID] = MJTag_BestMatchTagID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_SourceContentItemID
  ON
    [t].[SourceContentItemID] = MJContentItem_SourceContentItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentSource] AS MJContentSource_SourceContentSourceID
  ON
    [t].[SourceContentSourceID] = MJContentSource_SourceContentSourceID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_ResolvedTagID
  ON
    [t].[ResolvedTagID] = MJTag_ResolvedTagID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ReviewedByUserID
  ON
    [t].[ReviewedByUserID] = MJUser_ReviewedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTagSuggestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: Permissions for vwTagSuggestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTagSuggestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: spCreateTagSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TagSuggestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTagSuggestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTagSuggestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTagSuggestion]
    @ID uniqueidentifier = NULL,
    @ProposedName nvarchar(255),
    @ProposedParentID uniqueidentifier,
    @BestMatchTagID uniqueidentifier,
    @BestMatchScore decimal(4, 3),
    @Reason nvarchar(50),
    @SourceContentItemID uniqueidentifier,
    @SourceContentSourceID uniqueidentifier,
    @SourceText nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @ResolvedTagID uniqueidentifier,
    @ReviewedByUserID uniqueidentifier,
    @ReviewedAt datetimeoffset,
    @ReviewerNotes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TagSuggestion]
            (
                [ID],
                [ProposedName],
                [ProposedParentID],
                [BestMatchTagID],
                [BestMatchScore],
                [Reason],
                [SourceContentItemID],
                [SourceContentSourceID],
                [SourceText],
                [Status],
                [ResolvedTagID],
                [ReviewedByUserID],
                [ReviewedAt],
                [ReviewerNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProposedName,
                @ProposedParentID,
                @BestMatchTagID,
                @BestMatchScore,
                @Reason,
                @SourceContentItemID,
                @SourceContentSourceID,
                @SourceText,
                ISNULL(@Status, 'Pending'),
                @ResolvedTagID,
                @ReviewedByUserID,
                @ReviewedAt,
                @ReviewerNotes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TagSuggestion]
            (
                [ProposedName],
                [ProposedParentID],
                [BestMatchTagID],
                [BestMatchScore],
                [Reason],
                [SourceContentItemID],
                [SourceContentSourceID],
                [SourceText],
                [Status],
                [ResolvedTagID],
                [ReviewedByUserID],
                [ReviewedAt],
                [ReviewerNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProposedName,
                @ProposedParentID,
                @BestMatchTagID,
                @BestMatchScore,
                @Reason,
                @SourceContentItemID,
                @SourceContentSourceID,
                @SourceText,
                ISNULL(@Status, 'Pending'),
                @ResolvedTagID,
                @ReviewedByUserID,
                @ReviewedAt,
                @ReviewerNotes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTagSuggestions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagSuggestion] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tag Suggestions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTagSuggestion] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: spUpdateTagSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TagSuggestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTagSuggestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTagSuggestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTagSuggestion]
    @ID uniqueidentifier,
    @ProposedName nvarchar(255),
    @ProposedParentID uniqueidentifier,
    @BestMatchTagID uniqueidentifier,
    @BestMatchScore decimal(4, 3),
    @Reason nvarchar(50),
    @SourceContentItemID uniqueidentifier,
    @SourceContentSourceID uniqueidentifier,
    @SourceText nvarchar(MAX),
    @Status nvarchar(20),
    @ResolvedTagID uniqueidentifier,
    @ReviewedByUserID uniqueidentifier,
    @ReviewedAt datetimeoffset,
    @ReviewerNotes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagSuggestion]
    SET
        [ProposedName] = @ProposedName,
        [ProposedParentID] = @ProposedParentID,
        [BestMatchTagID] = @BestMatchTagID,
        [BestMatchScore] = @BestMatchScore,
        [Reason] = @Reason,
        [SourceContentItemID] = @SourceContentItemID,
        [SourceContentSourceID] = @SourceContentSourceID,
        [SourceText] = @SourceText,
        [Status] = @Status,
        [ResolvedTagID] = @ResolvedTagID,
        [ReviewedByUserID] = @ReviewedByUserID,
        [ReviewedAt] = @ReviewedAt,
        [ReviewerNotes] = @ReviewerNotes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTagSuggestions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTagSuggestions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagSuggestion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TagSuggestion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTagSuggestion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTagSuggestion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTagSuggestion
ON [${flyway:defaultSchema}].[TagSuggestion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TagSuggestion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TagSuggestion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tag Suggestions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTagSuggestion] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tag Suggestions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tag Suggestions
-- Item: spDeleteTagSuggestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TagSuggestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTagSuggestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTagSuggestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTagSuggestion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TagSuggestion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagSuggestion] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tag Suggestions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTagSuggestion] TO [cdp_Integration]



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

-- Index for foreign key EmbeddingModelID in table Tag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Tag_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Tag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Tag_EmbeddingModelID ON [${flyway:defaultSchema}].[Tag] ([EmbeddingModelID]);

/* SQL text to update entity field related entity name field map for entity field ID 2681AEAC-3D38-478E-854B-9C0D271279F8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2681AEAC-3D38-478E-854B-9C0D271279F8', @RelatedEntityNameFieldMap='EmbeddingModel'

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
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [t].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
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
    @MergedIntoTagID uniqueidentifier,
    @IsGlobal bit = NULL,
    @AllowAutoGrow bit = NULL,
    @IsFrozen bit = NULL,
    @MaxChildren int,
    @MaxDescendantDepth int,
    @MinWeight decimal(3, 2),
    @RequiresReview bit = NULL,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier
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
                [MergedIntoTagID],
                [IsGlobal],
                [AllowAutoGrow],
                [IsFrozen],
                [MaxChildren],
                [MaxDescendantDepth],
                [MinWeight],
                [RequiresReview],
                [EmbeddingVector],
                [EmbeddingModelID]
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
                @MergedIntoTagID,
                ISNULL(@IsGlobal, 1),
                ISNULL(@AllowAutoGrow, 1),
                ISNULL(@IsFrozen, 0),
                @MaxChildren,
                @MaxDescendantDepth,
                @MinWeight,
                ISNULL(@RequiresReview, 0),
                @EmbeddingVector,
                @EmbeddingModelID
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
                [MergedIntoTagID],
                [IsGlobal],
                [AllowAutoGrow],
                [IsFrozen],
                [MaxChildren],
                [MaxDescendantDepth],
                [MinWeight],
                [RequiresReview],
                [EmbeddingVector],
                [EmbeddingModelID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID,
                @DisplayName,
                @Description,
                ISNULL(@Status, 'Active'),
                @MergedIntoTagID,
                ISNULL(@IsGlobal, 1),
                ISNULL(@AllowAutoGrow, 1),
                ISNULL(@IsFrozen, 0),
                @MaxChildren,
                @MaxDescendantDepth,
                @MinWeight,
                ISNULL(@RequiresReview, 0),
                @EmbeddingVector,
                @EmbeddingModelID
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
    @MergedIntoTagID uniqueidentifier,
    @IsGlobal bit,
    @AllowAutoGrow bit,
    @IsFrozen bit,
    @MaxChildren int,
    @MaxDescendantDepth int,
    @MinWeight decimal(3, 2),
    @RequiresReview bit,
    @EmbeddingVector nvarchar(MAX),
    @EmbeddingModelID uniqueidentifier
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
        [MergedIntoTagID] = @MergedIntoTagID,
        [IsGlobal] = @IsGlobal,
        [AllowAutoGrow] = @AllowAutoGrow,
        [IsFrozen] = @IsFrozen,
        [MaxChildren] = @MaxChildren,
        [MaxDescendantDepth] = @MaxDescendantDepth,
        [MinWeight] = @MinWeight,
        [RequiresReview] = @RequiresReview,
        [EmbeddingVector] = @EmbeddingVector,
        [EmbeddingModelID] = @EmbeddingModelID
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01ae9e00-305f-4fec-b8d2-a0a906d34f70' OR (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EmbeddingModel')) BEGIN
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
            '01ae9e00-305f-4fec-b8d2-a0a906d34f70',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100043,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b444eb26-6ed0-4beb-8f8c-f6c6b5cfd820' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ProposedParent')) BEGIN
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
            'b444eb26-6ed0-4beb-8f8c-f6c6b5cfd820',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100033,
            'ProposedParent',
            'Proposed Parent',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d1c0858-4387-4070-a37e-f1b9d840e43b' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'BestMatchTag')) BEGIN
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
            '5d1c0858-4387-4070-a37e-f1b9d840e43b',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100034,
            'BestMatchTag',
            'Best Match Tag',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51c44037-ed00-47bb-91f9-aa6b344dec75' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'SourceContentItem')) BEGIN
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
            '51c44037-ed00-47bb-91f9-aa6b344dec75',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100035,
            'SourceContentItem',
            'Source Content Item',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd972301f-d1da-4cbd-90e7-3c6657d15f64' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'SourceContentSource')) BEGIN
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
            'd972301f-d1da-4cbd-90e7-3c6657d15f64',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100036,
            'SourceContentSource',
            'Source Content Source',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbbf3af6-4c7c-4116-b357-ce0643e0c7dd' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ResolvedTag')) BEGIN
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
            'dbbf3af6-4c7c-4116-b357-ce0643e0c7dd',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100037,
            'ResolvedTag',
            'Resolved Tag',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc4c9e6d-6326-4e28-bb7d-7686cb281fbe' OR (EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451' AND Name = 'ReviewedByUser')) BEGIN
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
            'cc4c9e6d-6326-4e28-bb7d-7686cb281fbe',
            'BCF03E3B-D2B2-4557-ACEB-95B18495F451', -- Entity: MJ: Tag Suggestions
            100038,
            'ReviewedByUser',
            'Reviewed By User',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43d9e184-f855-43a3-b704-d0036172dd30' OR (EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0' AND Name = 'Tag')) BEGIN
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
            '43d9e184-f855-43a3-b704-d0036172dd30',
            'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', -- Entity: MJ: Tag Synonyms
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7aa3a90-0588-4579-8f17-6a6a5c69f51c' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = 'Tag')) BEGIN
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
            'e7aa3a90-0588-4579-8f17-6a6a5c69f51c',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f98b5333-dfd0-4163-8068-95a913d7326d' OR (EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C' AND Name = 'ScopeEntity')) BEGIN
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
            'f98b5333-dfd0-4163-8068-95a913d7326d',
            'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', -- Entity: MJ: Tag Scopes
            100014,
            'ScopeEntity',
            'Scope Entity',
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
               SET IsNameField = 1
               WHERE ID = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7366BE86-000C-44E3-8B16-FC97FBD8B586'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7366BE86-000C-44E3-8B16-FC97FBD8B586'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F98B5333-DFD0-4163-8068-95A913D7326D'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '7366BE86-000C-44E3-8B16-FC97FBD8B586'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8E4149A0-D01D-48FD-9E1B-8764EBC4409D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '2D4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '2C4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = '0C248F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1
         

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F95E7337-1169-4D05-B6EC-0A14A7626E21'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F95E7337-1169-4D05-B6EC-0A14A7626E21'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B50A4543-D60F-4440-9587-CB61C449D06A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4AE65FCA-B822-44F1-AC56-70606E6CC190'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '43D9E184-F855-43A3-B704-D0036172DD30'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F95E7337-1169-4D05-B6EC-0A14A7626E21'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B50A4543-D60F-4440-9587-CB61C449D06A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '43D9E184-F855-43A3-B704-D0036172DD30'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B50A4543-D60F-4440-9587-CB61C449D06A'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '83526F85-6ADC-40BD-A2DF-AC433F616F9B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EF060F94-EFB2-4057-AF53-4B13280C307C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5D1C0858-4387-4070-A37E-F1B9D840E43B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '51C44037-ED00-47BB-91F9-AA6B344DEC75'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '83526F85-6ADC-40BD-A2DF-AC433F616F9B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EF060F94-EFB2-4057-AF53-4B13280C307C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '51C44037-ED00-47BB-91F9-AA6B344DEC75'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '83526F85-6ADC-40BD-A2DF-AC433F616F9B'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'EF060F94-EFB2-4057-AF53-4B13280C307C'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Tag Scopes.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E7AA3A90-0588-4579-8F17-6A6A5C69F51C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Scopes.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '78A7D431-93EB-485A-9667-E2CE0EB31F2A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Scopes.ScopeEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F98B5333-DFD0-4163-8068-95A913D7326D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Scopes.ScopeEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '815C5C75-ECDE-4090-BC99-615C6B209532' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Scopes.ScopeRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7366BE86-000C-44E3-8B16-FC97FBD8B586' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Scopes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B3123F9-9973-4C70-9B0B-7156A6BD57F2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Scopes.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73FA4EEF-DB95-469D-92B0-3318A9C2663D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Scopes.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B925E50C-AA27-4C58-9C3A-9625E17989E8' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tags */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-tags', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('73b3b11d-8453-40d3-be50-8408485656b0', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'FieldCategoryInfo', '{"Tag Configuration":{"icon":"fa fa-tag","description":"Basic details regarding the tag being scoped"},"Scope Definition":{"icon":"fa fa-crosshairs","description":"Defines the specific entity and record context for tag visibility"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('957f9756-6a09-48d4-be47-25de84ed5ed1', 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C', 'FieldCategoryIcons', '{"Tag Configuration":"fa fa-tag","Scope Definition":"fa fa-crosshairs","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'EA41DE76-F03F-4335-A98D-FACFA37AFB1C'
      

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info MJ: Tag Synonyms.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6BA484DC-192C-4D78-BDA6-F05CC8FB9565' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Synonyms.TagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Mapping',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE84807F-A1A6-40ED-A154-BC7B7F59FAD3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Synonyms.Tag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Mapping',
   GeneratedFormSection = 'Category',
   DisplayName = 'Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '43D9E184-F855-43A3-B704-D0036172DD30' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Synonyms.Synonym 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Synonym Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F95E7337-1169-4D05-B6EC-0A14A7626E21' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Synonyms.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Synonym Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B50A4543-D60F-4440-9587-CB61C449D06A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Synonyms.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FBD3C83-DC1C-41B6-9BF2-BBE89DC42901' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Synonyms.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4AE65FCA-B822-44F1-AC56-70606E6CC190' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tags */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-tags', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c19caa18-c01d-4214-9529-a1e1627298e8', 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', 'FieldCategoryInfo', '{"Tag Mapping":{"icon":"fa fa-link","description":"Defines the relationship between the synonym and the target tag"},"Synonym Details":{"icon":"fa fa-tag","description":"Details regarding the synonym term and its origin"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('451f3f46-39b0-452f-9566-c27bb0dadef4', 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0', 'FieldCategoryIcons', '{"Tag Mapping":"fa fa-link","Synonym Details":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'FE0D485E-8C3F-4FE0-BD07-EF81E8F14CE0'
      

/* Set categories for 23 fields */

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
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '674317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55C353F4-3F77-4BE6-B931-AA23603CF3CA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44B30122-35F7-4954-82AA-329F26486ED5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MergedIntoTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Merged Into',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23E00FA1-C0B5-4370-B526-78F65F2571D2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MergedIntoTag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Merged Into Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD942B17-CF54-41C5-B8B3-6A66BAC2C41E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.RootMergedIntoTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Merged Into',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D47C8E2A-AAAC-4C4D-992E-F595DC94877C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.IsGlobal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E4149A0-D01D-48FD-9E1B-8764EBC4409D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.AllowAutoGrow 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '188A03E5-163F-4305-B05D-A1CAFC786695' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.IsFrozen 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '06C53AD9-6E47-40F6-8A54-22B08FFAC96E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MaxChildren 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40C2E9D8-C6F6-4060-B56B-88ABBC8E0698' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MaxDescendantDepth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B752F3F4-1D32-4645-925F-28E6D6C122C0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.MinWeight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E7ED65E-41C6-4C6D-8659-52CFFF1B46DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.RequiresReview 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Tag Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E54B8418-2042-44D3-ACDD-00E34D6DB818' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.EmbeddingVector 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Intelligence',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '32BD0C45-CE4C-41C5-8F42-9075A36B27AE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.EmbeddingModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Intelligence',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2681AEAC-3D38-478E-854B-9C0D271279F8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tags.EmbeddingModel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'AI Intelligence',
   GeneratedFormSection = 'Category',
   DisplayName = 'Embedding Model Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01AE9E00-305F-4FEC-B8D2-A0A906D34F70' AND AutoUpdateCategory = 1

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

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Tag Configuration":{"icon":"fa fa-sliders-h","description":"Behavioral settings and constraints for tag management and auto-tagging."},"AI Intelligence":{"icon":"fa fa-brain","description":"AI-related fields for semantic embeddings and model tracking."}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Tag Configuration":"fa fa-sliders-h","AI Intelligence":"fa fa-brain"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC912468-B579-46CE-A7F7-CB110AA54789' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ProposedName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '25782CCD-889E-433D-B2CC-C2A0E2E2BE5D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ProposedParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Proposed Parent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2CBA41B4-7CA6-43B7-B854-8F1B5C9D8413' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ProposedParent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Proposed Parent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B444EB26-6ED0-4BEB-8F8C-F6C6B5CFD820' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.BestMatchTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Analysis',
   GeneratedFormSection = 'Category',
   DisplayName = 'Best Match Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D9DFCF44-E225-4EC2-A08C-C2C1EDE9565D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.BestMatchTag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Analysis',
   GeneratedFormSection = 'Category',
   DisplayName = 'Best Match Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D1C0858-4387-4070-A37E-F1B9D840E43B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.BestMatchScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Matching Analysis',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14685A97-7362-4755-847B-3C6043D0967F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Suggestion Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '83526F85-6ADC-40BD-A2DF-AC433F616F9B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.SourceContentItemID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Content Item',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FBAB09CD-DB94-4DB7-A3C2-B783247E0E21' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.SourceContentItem 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Content Item Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51C44037-ED00-47BB-91F9-AA6B344DEC75' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.SourceContentSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Content Source',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3BDFB3E2-F43E-44AB-AD6B-516C47C12E9B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.SourceContentSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Content Source Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D972301F-D1DA-4CBD-90E7-3C6657D15F64' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.SourceText 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '960C7BEA-30A6-4D48-845A-065D8A6275BE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Review Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF060F94-EFB2-4057-AF53-4B13280C307C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ResolvedTagID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Review Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved Tag',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D6D17DA-DA7F-43F1-90F1-424F908448D9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ResolvedTag 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Review Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Resolved Tag Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DBBF3AF6-4C7C-4116-B357-CE0643E0C7DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ReviewedByUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Review Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reviewed By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D5357C14-3B81-4A98-9E1D-516B56248907' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ReviewedByUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Review Workflow',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reviewed By User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC4C9E6D-6326-4E28-BB7D-7686CB281FBE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ReviewedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Review Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4FD8477-E9B1-4156-8B34-0D03D2E332DC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.ReviewerNotes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Review Workflow',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7A894CCA-6BCE-4F45-ADA9-D750813A7462' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '371B3A78-7A29-4C93-99E5-E88E8F243C63' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Tag Suggestions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AD03EFF-39F3-4227-9260-BB2E3118F6FC' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tags */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-tags', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b02900a4-fdc4-4cd9-b2cf-e6f796e94ecb', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'FieldCategoryInfo', '{"Suggestion Details":{"icon":"fa fa-lightbulb","description":"Core details regarding the proposed tag and the reason for its generation."},"Matching Analysis":{"icon":"fa fa-project-diagram","description":"System-calculated match scores and references to existing taxonomy tags."},"Source Context":{"icon":"fa fa-file-alt","description":"Contextual information about the content source that triggered the suggestion."},"Review Workflow":{"icon":"fa fa-check-double","description":"Review status, resolution details, and audit information for human-in-the-loop actions."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f16cd1e5-bdbc-436e-9e37-738d0e3fff57', 'BCF03E3B-D2B2-4557-ACEB-95B18495F451', 'FieldCategoryIcons', '{"Suggestion Details":"fa fa-lightbulb","Matching Analysis":"fa fa-project-diagram","Source Context":"fa fa-file-alt","Review Workflow":"fa fa-check-double","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'BCF03E3B-D2B2-4557-ACEB-95B18495F451'
      

