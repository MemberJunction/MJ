-- ============================================================================
-- Migration: Create betty schema for the BLA (Betty Layered Assembler) Flow Agent
-- ============================================================================
-- The BLA agent assembles a multi-block, multi-role chat-style prompt by
-- looking up reusable text snippets ("PromptComponents") for a given
-- AIPrompt, scoped by Organization and Instance, then handing the assembled
-- ChatMessage[] to AIPromptRunner.ExecutePrompt.
--
-- This migration creates ONLY the schema and tables needed to back that
-- lookup. The AIPrompt, Template, TemplateContent, Action, and AIAgent
-- records that wire the BLA agent itself together are MJ metadata and live
-- in /metadata/ — they will be pushed via `mj sync push`, not via SQL here.
--
-- Three tables, all in a new `betty` schema:
--   betty.Organization   — tenant root (UUID + Name)
--   betty.Instance       — child of Organization (UUID + FK + Name)
--   betty.PromptComponent — the text snippets, scoped (PromptID, Org?, Instance?)
-- ============================================================================


-- 1. Create the betty schema if it does not already exist.
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'betty')
BEGIN
    EXEC('CREATE SCHEMA [betty]')
END
GO


-- 2. Document the schema.
IF NOT EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE class = 3  -- schema level
      AND major_id = SCHEMA_ID('betty')
      AND name = N'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Schema for the BLA (Betty Layered Assembler) Flow Agent. Holds reusable prompt-text components scoped by AIPrompt + Organization + Instance, plus the Organization/Instance lookup tables those components reference.',
        @level0type = N'SCHEMA',
        @level0name = N'betty'
END
GO


-- 3. betty.Organization — tenant root.
CREATE TABLE [betty].[Organization] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Organization PRIMARY KEY (ID),
    CONSTRAINT UQ_Organization_Name UNIQUE (Name)
);
GO


-- 4. betty.Instance — child of Organization. A given InstanceID is always
-- under exactly one OrganizationID; the BLA action assumes this and uses it
-- to derive Org from Instance when both are passed.
CREATE TABLE [betty].[Instance] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrganizationID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Instance PRIMARY KEY (ID),
    CONSTRAINT FK_Instance_Organization FOREIGN KEY (OrganizationID)
        REFERENCES [betty].[Organization](ID),
    CONSTRAINT UQ_Instance_Org_Name UNIQUE (OrganizationID, Name)
);
GO


-- 5. betty.PromptComponent — the assembled-prompt text snippets.
--
-- Selection cascade per Name within a (PromptID) group:
--   (PromptID + OrganizationID + InstanceID matched)  >
--   (PromptID + OrganizationID matched, no Instance)  >
--   (PromptID matched, no Org / no Instance)
--
-- OrganizationID and InstanceID are both NULL-able to express the cascade.
-- Sort orders the FINAL assembly; it is NOT used for selection tie-breaking
-- (the action picks TOP 1 with a stable ORDER BY ID when ties occur).
CREATE TABLE [betty].[PromptComponent] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PromptID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    [Text] NVARCHAR(MAX) NOT NULL,
    Sort INT NOT NULL DEFAULT 0,
    [Role] NVARCHAR(20) NOT NULL DEFAULT 'System',
    OrganizationID UNIQUEIDENTIFIER NULL,
    InstanceID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_PromptComponent PRIMARY KEY (ID),
    CONSTRAINT FK_PromptComponent_AIPrompt FOREIGN KEY (PromptID)
        REFERENCES ${flyway:defaultSchema}.[AIPrompt](ID),
    CONSTRAINT FK_PromptComponent_Organization FOREIGN KEY (OrganizationID)
        REFERENCES [betty].[Organization](ID),
    CONSTRAINT FK_PromptComponent_Instance FOREIGN KEY (InstanceID)
        REFERENCES [betty].[Instance](ID),
    CONSTRAINT CK_PromptComponent_Role CHECK ([Role] IN ('System', 'User', 'Assistant'))
);
GO


-- ============================================================================
-- Extended properties (column descriptions consumed by CodeGen for TSDoc)
-- ============================================================================

-- betty.Organization
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tenant root for the BLA agent. PromptComponents may be scoped to a specific Organization; rows with no OrganizationID match any organization (least-specific tier).',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'Organization';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name of the organization. Unique.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'Organization',
    @level2type = N'COLUMN', @level2name = N'Name';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-text description of the organization.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'Organization',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

-- betty.Instance
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A deployment or environment within an Organization (e.g. dev, prod, customer-specific). InstanceID is always under exactly one OrganizationID; the BLA agent assumes this when narrowing PromptComponent matches.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'Instance';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'FK to the parent Organization. Required.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'Instance',
    @level2type = N'COLUMN', @level2name = N'OrganizationID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Instance name. Unique within an Organization.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'Instance',
    @level2type = N'COLUMN', @level2name = N'Name';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-text description of the instance.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'Instance',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

-- betty.PromptComponent
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A single reusable text snippet for an AIPrompt, optionally scoped to an Organization and/or Instance. The BLA assemble-prompt action selects the most specific component per Name within the matching PromptID (Org+Instance > Org > none) and renders them by Sort + Role into a structured ChatMessage[] for AIPromptRunner.ExecutePrompt.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'FK to the __mj.AIPrompt the component belongs to. Only components matching this PromptID are ever considered, regardless of any other scoping match.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'PromptID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Logical name of the component within the prompt (e.g. "persona", "task-rules", "few-shot-example"). The BLA selects at most one row per (PromptID, Name) at runtime, using the cascading specificity match.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'Name';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional free-text description of the component''s intent. Not used at runtime.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'Description';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The actual text content rendered into a ChatMessage. May include template variables that downstream rendering substitutes.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'Text';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Final-assembly ordering. Lower Sort renders earlier in the ChatMessage[] (after conversation history). NOT used for selection tie-breaking among same-tier matches — that uses a stable TOP 1 by ID.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'Sort';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role of the rendered message in the final ChatMessage[]: System, User, or Assistant. Each component becomes its own message at the LLM API layer, so System -> User -> System -> User sequences are preserved.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'Role';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional FK to betty.Organization. NULL means "applies to any organization" (least-specific tier). When non-NULL, the component only matches at runtime if the caller-supplied OrganizationID equals this value.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'OrganizationID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional FK to betty.Instance. NULL means "applies to any instance within whatever Organization scope is set" (or any instance globally if OrganizationID is also NULL). When non-NULL, the component only matches at runtime if the caller-supplied InstanceID equals this value AND its Organization matches too.',
    @level0type = N'SCHEMA', @level0name = N'betty',
    @level1type = N'TABLE',  @level1name = N'PromptComponent',
    @level2type = N'COLUMN', @level2name = N'InstanceID';
GO
