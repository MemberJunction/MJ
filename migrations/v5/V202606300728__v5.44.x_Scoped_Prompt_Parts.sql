-- =====================================================================
-- Scoped Prompt Parts (v5.44.x)
-- =====================================================================
--
-- Adds a first-class, scope-aware prompt-construction primitive to MJ
-- core: small, named, role-tagged fragments of prompt text ("prompt
-- parts") attached to an AIPrompt and optionally narrowed by the SAME
-- polymorphic scope the agent runtime already carries for memory
-- (PrimaryScopeEntity/Record + SecondaryScopes on ExecuteAgentParams /
-- AIAgentNote).
--
-- This lets any MJ application control LLM behavior per scope by editing
-- rows, not code: ship a GLOBAL default for a part (e.g. "Personality"
-- on a prompt), then override just that part for a specific scoped
-- record (an organization, a tenant, a channel, …) — most-specific wins
-- per part Name, while distinct Names compose additively by Sort. The
-- scope is polymorphic (entity + record + JSON secondary dimensions), so
-- MJ core stays tenancy-agnostic — a multi-tenant layer (e.g. BCSaaS)
-- simply sets the scope to its Organization/Channel and layers extra
-- metadata on top if desired.
--
-- Resolution + role-faithful assembly are performed by a cached engine
-- (forthcoming) over this table; this migration only creates the schema.
--
-- Tables created
-- --------------
--   1. ScopedPromptPart
--
-- Note: DDL + extended properties only. Views, sprocs, FK indexes, the
-- __mj_CreatedAt/__mj_UpdatedAt columns + triggers, and the EntityField /
-- entity-class metadata are all produced by CodeGen from this schema.
-- =====================================================================

CREATE TABLE ${flyway:defaultSchema}.ScopedPromptPart (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PromptID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    [Role] NVARCHAR(20) NOT NULL DEFAULT 'System',
    Sort INT NOT NULL DEFAULT 0,
    [Text] NVARCHAR(MAX) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    PrimaryScopeEntityID UNIQUEIDENTIFIER NULL,
    PrimaryScopeRecordID NVARCHAR(100) NULL,
    SecondaryScopes NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_ScopedPromptPart PRIMARY KEY (ID),
    CONSTRAINT FK_ScopedPromptPart_AIPrompt
        FOREIGN KEY (PromptID) REFERENCES ${flyway:defaultSchema}.AIPrompt(ID),
    CONSTRAINT FK_ScopedPromptPart_PrimaryScopeEntity
        FOREIGN KEY (PrimaryScopeEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_ScopedPromptPart_Role
        CHECK ([Role] IN ('System', 'User', 'Assistant')),
    CONSTRAINT CK_ScopedPromptPart_Status
        CHECK (Status IN ('Active', 'Provisional', 'Archived'))
);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A scope-aware, role-tagged fragment of prompt text attached to an AIPrompt. Optionally narrowed by a polymorphic scope (PrimaryScopeEntity/Record + SecondaryScopes — the same scope the agent runtime carries for memory). Resolved by a cached engine via a specificity cascade per (PromptID, Name) — more-specific scope wins — then assembled additively (by Sort) into a role-faithful chat message list. Lets any MJ app control prompt behavior per scope by editing rows, not code.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Logical part name (e.g. Personality, Instructions). The OVERRIDE key: per Name within a PromptID, the most-specific scope wins. Distinct Names compose additively.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Chat message role this part renders as: System, User, or Assistant. Drives role-faithful assembly (assembled messages drive the model directly, not flattened into one system blob).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'Role';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Final-assembly ordering (ASC). Controls this part''s position in the assembled message list. Not used for specificity tie-breaking.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'Sort';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The prompt-part text. May contain Nunjucks templating, rendered against the prompt''s data context at execution time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'Text';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional human-readable note about this part (authoring aid; not sent to the model).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The record ID within the primary scope entity that this part is scoped to. NULL = global (applies regardless of scope). When set with empty SecondaryScopes, the part is primary-scope-only (e.g. org-level).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'PrimaryScopeRecordID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object of additional scope dimensions (e.g. {"ChannelID":"..."}). Empty/NULL with PrimaryScopeRecordID set = primary-scope-only; populated = fully-scoped. Matched (cascading or strict) against the run''s SecondaryScopes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'SecondaryScopes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle: Active (live), Provisional (staged; eligible but flaggable as not-yet-final), Archived (excluded from resolution). Only Active and Provisional are eligible for resolution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'Status';
