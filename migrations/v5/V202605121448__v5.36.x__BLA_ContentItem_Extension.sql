-- ============================================================================
-- Migration: Create betty.ContentItem — TPT extension of __mj.ContentItem
-- ============================================================================
-- Extends the base content-item record with Betty-specific fields needed for
-- per-organization scoping, chunking, and Azure-AI-Search-indexed retrieval.
--
-- IS-A (TPT) convention: betty.ContentItem.ID is BOTH the primary key AND a
-- foreign key back to __mj.ContentItem.ID. The shared UUID is what makes
-- the two rows the same logical record. See packages/MJCore/docs/isa-relationships.md
-- and guides/CONTENT_AUTOTAGGING_GUIDE.md for the broader pattern.
--
-- The ISA wiring itself (Entity.ParentID metadata) is NOT set here — that is
-- a CodeGen / metadata responsibility (set after CodeGen discovers the new
-- table). This migration is schema-only per migrations/CLAUDE.md.
--
-- Added fields:
--   OrganizationID    — FK to betty.Organization. Required. Drives all
--                       per-tenant search filters at runtime.
--   Decorator         — Optional free text giving extra context for retrieval
--                       (think: hints to the LLM about what this snippet is
--                       and when it's relevant).
--   SourceIdentifier  — URL, file path, or other stable identifier of the
--                       original source. Used by ingest code to detect
--                       duplicates. Required.
--   UserLink          — Optional URL the end user follows to view the source
--                       in its original context (e.g. a public web page or
--                       a deep link into a doc viewer).
--   ParentID          — Optional self-FK. When the source content is too
--                       large and is split into chunks, each chunk's
--                       ParentID points at the top-level item's
--                       betty.ContentItem.ID (which is identical to the
--                       top-level __mj.ContentItem.ID).
-- ============================================================================


CREATE TABLE [betty].[ContentItem] (
    ID UNIQUEIDENTIFIER NOT NULL,
    OrganizationID UNIQUEIDENTIFIER NOT NULL,
    Decorator NVARCHAR(2000) NULL,
    SourceIdentifier NVARCHAR(2000) NOT NULL,
    UserLink NVARCHAR(2000) NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_BettyContentItem PRIMARY KEY (ID),
    -- TPT shared key: a betty.ContentItem row is the same UUID as its
    -- __mj.ContentItem row. The FK from ID → parent.ID enforces this.
    CONSTRAINT FK_BettyContentItem_Inherits FOREIGN KEY (ID)
        REFERENCES ${flyway:defaultSchema}.[ContentItem](ID),
    CONSTRAINT FK_BettyContentItem_Organization FOREIGN KEY (OrganizationID)
        REFERENCES [betty].[Organization](ID),
    -- Self-FK for chunk hierarchies. Intentionally NO ACTION on delete:
    -- chunk cleanup belongs to the ingest pipeline, not to the FK cascade,
    -- so we don't risk a multi-cascade-path error and we keep an audit
    -- trail if a parent is removed but chunks are still referenced.
    CONSTRAINT FK_BettyContentItem_ParentChunk FOREIGN KEY (ParentID)
        REFERENCES [betty].[ContentItem](ID)
);
GO


-- ============================================================================
-- Extended properties — picked up by CodeGen for TSDoc on the generated
-- entity class and exposed in the EntityField metadata. Order matches the
-- column order above.
-- ============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Betty-specific extension of MJ: Content Items. Shares its primary key with the parent __mj.ContentItem row (TPT inheritance) — a betty.ContentItem.ID is always the same UUID as its corresponding __mj.ContentItem.ID. Adds the tenant scope (OrganizationID), retrieval-context fields (Decorator, SourceIdentifier, UserLink), and chunk hierarchy (ParentID) used by the BLA / BettyNext agents.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'ContentItem';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Shared primary key with the parent __mj.ContentItem row. Same UUID, enforced by FK_BettyContentItem_Inherits. Generate the UUID once when creating the __mj.ContentItem row, then propagate it here.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'ContentItem',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'FK to betty.Organization. Required — every Betty content item belongs to exactly one organization, and the BLA search path filters by this column at runtime via the Search Scope''s Nunjucks-rendered MetadataFilter.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'ContentItem',
    @level2type = N'COLUMN', @level2name = N'OrganizationID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-text context that helps the LLM (and human reviewers) understand what this content item is and when it''s relevant. Indexed into Azure AI Search alongside Name/Description/Text so retrieval can hit author-supplied hints in addition to the raw body text.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'ContentItem',
    @level2type = N'COLUMN', @level2name = N'Decorator';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stable identifier of the original source (URL, file path, or other globally-unique string). Used by ingest code to detect and skip duplicates when re-ingesting from the same source. Required.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'ContentItem',
    @level2type = N'COLUMN', @level2name = N'SourceIdentifier';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional URL the end user follows to view the source in its original context (e.g. a public web page, an authenticated CMS deep-link, or a doc viewer). Separate from SourceIdentifier — SourceIdentifier is for dedup; UserLink is for human navigation.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'ContentItem',
    @level2type = N'COLUMN', @level2name = N'UserLink';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional self-reference. When the source content is large enough to be split into chunks for embedding/indexing, each chunk''s ParentID points at the top-level betty.ContentItem.ID (which is identical to the top-level __mj.ContentItem.ID, by TPT). NULL on the top-level item itself.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'ContentItem',
    @level2type = N'COLUMN', @level2name = N'ParentID';
GO
