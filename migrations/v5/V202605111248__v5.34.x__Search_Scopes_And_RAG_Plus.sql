-- =====================================================================================================================
-- Migration: Search Scopes & RAG+ — multi-phase ship (consolidated)
-- Version:   v5.32.x
-- =====================================================================================================================
-- This single file consolidates the schema work for the Search Scopes & RAG+ initiative
-- (Phases 1, 2A, 2D, 3, 4, plus a post-hoc unique-constraint tightening). Hand-authored DDL
-- comes first; CodeGen-emitted regenerations of entity metadata, views, sprocs, and
-- permission grants follow after the separator below.
--
-- Sections (DDL):
--   1. Phase 1 baseline — `SearchScope`, `SearchScopeProvider`, `SearchScopeEntity`,
--      `SearchScopeStorage`, `SearchScopeExternalIndex`, `AIAgentSearchScope`, plus the
--      `AIAgent.SearchScopeAccess` enum column ('None' | 'All' | 'Assigned').
--
--   2. Phase 2A.2 — `SearchScopePermission` table. User XOR Role principal, PermissionLevel
--      CHECK ∈ ('None','Read','Search','Manage'). Backs the 6-step permission resolver.
--
--   3. Phase 2D.6 — `SearchScope.RerankerBudgetCents` column. Per-search reranker spend cap;
--      enforced by `RerankerBudgetGuard` in the engine.
--
--   4. Phase 3.1 — `SearchExecutionLog` table. One row per `SearchEngine.Search()` invocation
--      (Status / ResultCount / TotalDurationMs / RerankerCostCents / ProvidersJSON / AIAgentID).
--
--   5. Phase 4.4 — `SearchScopeTestQuery` table. Saved test queries for the live-preview panel
--      on the SearchScope custom form.
--
--   6. Post-hoc fix — `UQ_SearchScopePermission_User` and `UQ_SearchScopePermission_Role`
--      unique constraints. Prevents duplicate (Scope, User) and (Scope, Role) grants.
--
-- Sections (CodeGen):
--   7-11. Five `CodeGen_Run_*.sql` outputs in commit order. These regenerate `EntityField`
--         rows, sprocs (`spCreate*`/`spUpdate*`/`spDelete*`), views, dropdown value lists,
--         and permission grants for everything Sections 1-6 changed.
--
-- Run order is chronological — DDL must precede the CodeGen output for that DDL because
-- CodeGen reads the new tables/columns and emits SPs that reference them.
--
-- Plan reference: RAG_plan.md Section 4.2 ("Expected migrations in commit order").
-- =====================================================================================================================


-- =====================================================================================================================
-- Section 1: Phase 1 baseline — Search Scope schema + AIAgent.SearchScopeAccess
-- (Source: V202604182034__v5.28.x__Add_Search_Scopes_And_Agent_Integration.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: Search Scopes & Agent Integration (RAG+)
-- Version:   v5.28.x
-- Plan:      plans/search-scopes-rag-plus.md
-- =============================================================================
-- Introduces configurable, permission-aware Search Scopes plus agent linkage
-- for pre-execution RAG and scoped tool-invoked search.
--
-- Tables created:
--   1. SearchScope                  — Named, reusable search boundary
--   2. SearchScopeProvider          — Which providers participate in a scope
--   3. SearchScopeExternalIndex     — Scoped external indexes (vector + 3rd-party)
--   4. SearchScopeEntity            — Scoped entity search + per-entity overrides
--   5. SearchScopeStorageAccount    — Scoped storage accounts / folders
--   6. AIAgentSearchScope           — M:N agent ↔ scope with phase/time control
--
-- Column added to existing AIAgent table:
--   SearchScopeAccess — All | Assigned | None
--
-- Notes:
--   - No __mj_* timestamp columns, no FK indexes (CodeGen handles both)
--   - No seed data (Global SearchScope + Search Result Set ArtifactType go
--     through metadata sync, not migration)
--   - Extended properties follow at the bottom (MJ convention)
-- =============================================================================


-- =============================================================================
-- TABLE 1: SearchScope
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.SearchScope (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Icon NVARCHAR(200) NULL,
    IsGlobal BIT NOT NULL DEFAULT 0,
    IsDefault BIT NOT NULL DEFAULT 0,
    OwnerUserID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    StartAt DATETIMEOFFSET NULL,
    EndAt DATETIMEOFFSET NULL,
    ScopeConfig NVARCHAR(MAX) NULL,
    SearchContextConfig NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchScope PRIMARY KEY (ID),
    CONSTRAINT UQ_SearchScope_Name UNIQUE (Name),
    CONSTRAINT FK_SearchScope_OwnerUser FOREIGN KEY (OwnerUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_SearchScope_Status CHECK (Status IN ('Active', 'Inactive'))
);
GO


-- =============================================================================
-- TABLE 2: SearchScopeProvider
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.SearchScopeProvider (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    SearchProviderID UNIQUEIDENTIFIER NOT NULL,
    Enabled BIT NOT NULL DEFAULT 1,
    MaxResultsOverride INT NULL,
    ProviderConfigOverride NVARCHAR(MAX) NULL,
    QueryTransformTemplateID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_SearchScopeProvider PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopeProvider_Scope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchScopeProvider_Provider FOREIGN KEY (SearchProviderID)
        REFERENCES ${flyway:defaultSchema}.SearchProvider(ID),
    CONSTRAINT FK_SearchScopeProvider_QueryTransformTemplate FOREIGN KEY (QueryTransformTemplateID)
        REFERENCES ${flyway:defaultSchema}.Template(ID),
    CONSTRAINT UQ_SearchScopeProvider UNIQUE (SearchScopeID, SearchProviderID)
);
GO


-- =============================================================================
-- TABLE 3: SearchScopeExternalIndex
-- =============================================================================
-- Scoped external/provider-owned indexes. Generic: covers vector stores
-- (Pinecone, Qdrant, PGVector) AND text/hybrid engines (Elasticsearch,
-- Typesense, Azure AI Search, OpenSearch). A single scope can mix types.
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.SearchScopeExternalIndex (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    IndexType NVARCHAR(40) NOT NULL DEFAULT 'Vector',
    VectorIndexID UNIQUEIDENTIFIER NULL,
    ExternalIndexName NVARCHAR(400) NULL,
    ExternalIndexConfig NVARCHAR(MAX) NULL,
    MetadataFilter NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchScopeExternalIndex PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopeExternalIndex_Scope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchScopeExternalIndex_VectorIndex FOREIGN KEY (VectorIndexID)
        REFERENCES ${flyway:defaultSchema}.VectorIndex(ID),
    CONSTRAINT CK_SearchScopeExternalIndex_IndexType
        CHECK (IndexType IN ('Vector','Elasticsearch','Typesense','AzureAISearch','OpenSearch','Other')),
    CONSTRAINT CK_SearchScopeExternalIndex_Identifier
        CHECK ((IndexType = 'Vector' AND VectorIndexID IS NOT NULL)
            OR (IndexType <> 'Vector' AND ExternalIndexName IS NOT NULL))
);
GO


-- =============================================================================
-- TABLE 4: SearchScopeEntity
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.SearchScopeEntity (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    EntityID UNIQUEIDENTIFIER NOT NULL,
    ExtraFilter NVARCHAR(MAX) NULL,
    UserSearchString NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchScopeEntity PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopeEntity_Scope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchScopeEntity_Entity FOREIGN KEY (EntityID)
        REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT UQ_SearchScopeEntity UNIQUE (SearchScopeID, EntityID)
);
GO


-- =============================================================================
-- TABLE 5: SearchScopeStorageAccount
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.SearchScopeStorageAccount (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    FileStorageAccountID UNIQUEIDENTIFIER NOT NULL,
    FolderPath NVARCHAR(1000) NULL,
    CONSTRAINT PK_SearchScopeStorageAccount PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopeStorageAccount_Scope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchScopeStorageAccount_Account FOREIGN KEY (FileStorageAccountID)
        REFERENCES ${flyway:defaultSchema}.FileStorageAccount(ID)
);
GO


-- =============================================================================
-- TABLE 6: AIAgentSearchScope
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.AIAgentSearchScope (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID UNIQUEIDENTIFIER NOT NULL,
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    Phase NVARCHAR(20) NOT NULL DEFAULT 'Both',
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    StartAt DATETIMEOFFSET NULL,
    EndAt DATETIMEOFFSET NULL,
    Priority INT NOT NULL DEFAULT 100,
    MaxResults INT NULL,
    MinScore DECIMAL(5,4) NULL,
    QueryTemplateID UNIQUEIDENTIFIER NULL,
    FusionWeightsOverride NVARCHAR(MAX) NULL,
    IsDefault BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_AIAgentSearchScope PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentSearchScope_Agent FOREIGN KEY (AgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentSearchScope_Scope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_AIAgentSearchScope_QueryTemplate FOREIGN KEY (QueryTemplateID)
        REFERENCES ${flyway:defaultSchema}.Template(ID),
    CONSTRAINT CK_AIAgentSearchScope_Phase
        CHECK (Phase IN ('PreExecution', 'AgentInvoked', 'Both')),
    CONSTRAINT CK_AIAgentSearchScope_Status
        CHECK (Status IN ('Active', 'Inactive'))
);
GO


-- =============================================================================
-- ALTER AIAgent: add SearchScopeAccess column
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.AIAgent
    ADD SearchScopeAccess NVARCHAR(20) NOT NULL
        CONSTRAINT DF_AIAgent_SearchScopeAccess DEFAULT 'None'
        CONSTRAINT CK_AIAgent_SearchScopeAccess CHECK (SearchScopeAccess IN ('All', 'Assigned', 'None'));
GO


-- =============================================================================
-- EXTENDED PROPERTIES (all new columns except PKs/FKs)
-- =============================================================================

-- ---- SearchScope ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A named, reusable boundary defining WHICH content participates in a search (providers, external indexes, entities, storage accounts). Combined with a runtime SearchContext, it enables multi-tenant, permission-aware, agent-friendly retrieval. See plans/search-scopes-rag-plus.md.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable scope name (e.g., "HR Policies", "Engineering Docs"). Unique across the system.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this scope covers. Surfaced to agents in the available-scopes prompt injection so the LLM can choose a scope.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Font Awesome (or equivalent) icon class used by the scope selector UI.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'Icon';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, this scope includes everything (equivalent to no scope filtering). Exactly one Global scope should exist; it is seeded via metadata sync.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'IsGlobal';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, this is the default scope for users/agents that do not specify one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'NULL = organization-wide scope. Set = personal scope owned by this user (visible/usable only by that user unless explicitly shared).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'OwnerUserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status. Only Active scopes are considered at query time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional time-window activation. Scope is inactive before StartAt. NULL = immediately active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'StartAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional time-window deactivation. Scope is inactive after EndAt. NULL = no expiry.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'EndAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration for advanced scope behavior. Recognized keys: rrfK (RRF k parameter), fusionWeights (per-provider weights), reRanker (optional re-ranker stage config: driverClass, inputTopN, outputTopN, config), permissionOverfetchFactor.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'ScopeConfig';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON defining available multi-tenant SearchContext dimensions, inheritance modes, and validation rules. Uses the SecondaryScopeConfig structure shared with the agent memory system (@memberjunction/ai-core-plus). NULL = scope is not multi-tenant aware.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'SearchContextConfig';


-- ---- SearchScopeProvider ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls which SearchProviders participate in a given SearchScope. Each row enables one provider within one scope, with optional overrides.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeProvider';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this provider is active for this scope. Lets an admin toggle providers off per-scope without deleting the row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeProvider',
    @level2type = N'COLUMN', @level2name = N'Enabled';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override the max-results value for this provider within this scope. NULL = use the provider''s default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeProvider',
    @level2type = N'COLUMN', @level2name = N'MaxResultsOverride';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON override for provider-specific configuration within this scope. Provider interprets.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeProvider',
    @level2type = N'COLUMN', @level2name = N'ProviderConfigOverride';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional FK to Templates. When set, the user/agent query is rewritten through this Template before being sent to this provider. Lets vector providers get a chunk-shaped rewrite while FTS providers get keyword extraction within the same scope. Resolution order: this > AIAgentSearchScope.QueryTemplateID > raw lastUserMessage.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeProvider',
    @level2type = N'COLUMN', @level2name = N'QueryTransformTemplateID';


-- ---- SearchScopeExternalIndex ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scoped external/provider-owned indexes. Generic — covers vector stores (Pinecone, Qdrant, PGVector) and text/hybrid engines (Elasticsearch, Typesense, Azure AI Search, OpenSearch). A single scope can mix types; each row is consumed only by the provider matching its IndexType.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeExternalIndex';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Discriminator. Determines which provider class consumes this row: Vector | Elasticsearch | Typesense | AzureAISearch | OpenSearch | Other.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeExternalIndex',
    @level2type = N'COLUMN', @level2name = N'IndexType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'FK to VectorIndex. REQUIRED when IndexType=''Vector''. NULL for all other IndexType values.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeExternalIndex',
    @level2type = N'COLUMN', @level2name = N'VectorIndexID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For non-vector IndexTypes: the remote engine''s index/collection/alias name (e.g., Elasticsearch index "kb_docs_v3", Typesense collection "articles"). NULL for IndexType=''Vector'' (VectorIndexID resolves the name instead).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeExternalIndex',
    @level2type = N'COLUMN', @level2name = N'ExternalIndexName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON with extra connection/config hints the provider needs (cluster alias, routing key, custom analyzer, etc.). Provider-interpreted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeExternalIndex',
    @level2type = N'COLUMN', @level2name = N'ExternalIndexConfig';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON filter expression applied as a native metadata filter on the remote engine. Pinecone/Qdrant/PGVector metadata filter, or Elasticsearch filter DSL, etc. Rendered as a Nunjucks template so SearchContext.PrimaryScopeRecordID and SearchContext.SecondaryScopes.* can be interpolated for multi-tenant filtering.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeExternalIndex',
    @level2type = N'COLUMN', @level2name = N'MetadataFilter';


-- ---- SearchScopeEntity ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls which entities participate in entity and full-text search within a scope, with optional per-entity filter and user-search-string overrides.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeEntity';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional SQL filter applied to this entity''s search within this scope. Example: Status=''Published'' AND DepartmentID=''abc''. Rendered as a Nunjucks template with SearchContext variables for multi-tenant filtering.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeEntity',
    @level2type = N'COLUMN', @level2name = N'ExtraFilter';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional override for the UserSearchString passed to RunView for this entity within this scope. Nunjucks template (e.g., "{{ query }} AND type:policy"). NULL = pass the user''s actual query through as-is.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeEntity',
    @level2type = N'COLUMN', @level2name = N'UserSearchString';


-- ---- SearchScopeStorageAccount ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls which file storage accounts/folders participate in a scope.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeStorageAccount';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional folder path restriction. NULL = entire storage account. Example: /policies/hr/. Rendered as a Nunjucks template with SearchContext variables so platforms can do per-tenant folder routing like /tenants/{{ context.PrimaryScopeRecordID }}/.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeStorageAccount',
    @level2type = N'COLUMN', @level2name = N'FolderPath';


-- ---- AIAgentSearchScope ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Many-to-many between agents and search scopes, with phase and scheduling control. Drives both pre-execution RAG and agent-invoked scoped search.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When this scope is used: PreExecution (injected as retrieved context before the agent runs), AgentInvoked (callable via the scoped search Action), or Both.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'Phase';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status. Only Active rows are considered at runtime.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Time-windowed activation for this agent-scope assignment. NULL = immediately active.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'StartAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Time-windowed deactivation for this agent-scope assignment. NULL = no expiry.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'EndAt';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering within Phase. Lower = higher priority. Used for pre-execution ordering and as default preference for agent-invoked scope selection.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override max results for this scope when used by this agent. NULL = use scope/engine default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'MaxResults';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override min score threshold (0.0000–1.0000). NULL = use engine default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'MinScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'FK to Templates. MJ Template used to generate the search query from conversation context (lastUserMessage, recentMessages, payload, etc.). NULL = use lastUserMessage as-is. Can be further specialized per-provider via SearchScopeProvider.QueryTransformTemplateID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'QueryTemplateID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON override for RRF per-provider fusion weights when this agent uses this scope. Resolution order: AIAgentSearchScope.FusionWeightsOverride > SearchScope.ScopeConfig.fusionWeights > engine defaults. Example: { "vector": 2.0, "fulltext": 1.0, "entity": 1.0 }.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'FusionWeightsOverride';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, this is the agent''s default scope when no scope is specified in a tool call.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentSearchScope',
    @level2type = N'COLUMN', @level2name = N'IsDefault';


-- ---- AIAgent.SearchScopeAccess ----
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls the agent''s search capability. All = may use any scope including Global; search action does not restrict. Assigned = may use ONLY scopes explicitly linked via AIAgentSearchScope; scoped search action enforces this. None = agent has no search capability; the scoped search action rejects all requests.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'SearchScopeAccess';
GO








 
-- =====================================================================================================================
-- Section 2: Phase 2A.2 — SearchScopePermission table
-- (Source: V202604280730__v5.30.x__Add_SearchScopePermission.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: Search Scope Permission (RAG+ Phase 2A)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 2A.2, plans/search-scopes-rag-plus.md
-- =============================================================================
-- Per-user / per-role permission grant on a SearchScope. Each row authorizes
-- exactly one principal (User OR Role, not both) at one of four levels.
-- Permission resolution combines this table with AIAgent.SearchScopeAccess for
-- agent-side fallbacks. See SearchScopePermissionResolver in
-- packages/SearchEngine/src/permissions/.
--
-- Notes:
--   - No __mj_* timestamp columns, no FK indexes (CodeGen handles both)
--   - No seed data (admins author rows through the SearchScope/AIAgent forms)
--   - Extended properties follow at the bottom (MJ convention)
-- =============================================================================


-- =============================================================================
-- TABLE: SearchScopePermission
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.SearchScopePermission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NULL,
    RoleID UNIQUEIDENTIFIER NULL,
    PermissionLevel NVARCHAR(20) NOT NULL,
    CONSTRAINT PK_SearchScopePermission PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopePermission_SearchScope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchScopePermission_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_SearchScopePermission_Role FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_SearchScopePermission_Level
        CHECK (PermissionLevel IN ('None', 'Read', 'Search', 'Manage')),
    CONSTRAINT CK_SearchScopePermission_Principal
        CHECK ((UserID IS NOT NULL AND RoleID IS NULL)
            OR (UserID IS NULL AND RoleID IS NOT NULL)),
    CONSTRAINT UQ_SearchScopePermission_User
        UNIQUE (SearchScopeID, UserID),
    CONSTRAINT UQ_SearchScopePermission_Role
        UNIQUE (SearchScopeID, RoleID)
);
GO


-- =============================================================================
-- Extended Properties
-- =============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-user or per-role permission grant on a SearchScope. Exactly one of UserID or RoleID is set on each row; the other is NULL. PermissionLevel is one of None, Read, Search, Manage. Combined with AIAgent.SearchScopeAccess for agent-side fallbacks via the SearchScopePermissionResolver.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key. Auto-generated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The SearchScope this permission row applies to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'SearchScopeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user this permission applies to. Mutually exclusive with RoleID — exactly one must be set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The role this permission applies to. Mutually exclusive with UserID — exactly one must be set. Permissions granted via roles flow to all users in that role.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'RoleID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Capability granted on this SearchScope. None = explicit deny (overrides role grants), Read = view scope metadata, Search = invoke ScopedSearchAction, Manage = full edit including authoring of permission rows. The resolver picks the highest level when multiple grants apply (direct + role).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopePermission',
    @level2type = N'COLUMN', @level2name = N'PermissionLevel';

-- =====================================================================================================================
-- Section 3: Phase 2D.6 — SearchScope.RerankerBudgetCents
-- (Source: V202604281100__v5.30.x__Add_SearchScope_RerankerBudget.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: SearchScope reranker budget (RAG+ Phase 2D)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 2D.6, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- Adds a per-scope cents-budget that caps how much real-provider reranker spend
-- (Cohere, Voyage, OpenAI) can occur on a single search invocation. The budget
-- guard short-circuits before each rerank call when the projected cost would
-- exceed the remaining budget, and accumulates actual cost reported by each
-- reranker through the BaseReRanker.CostReporter callback (P2D.1).
--
-- Behavior with NULL: no cap. Existing scopes keep behaving exactly as before.
--
-- Notes:
--   - No __mj_* timestamp columns, no manual indexes (CodeGen handles)
--   - No seed data (admins author values through the SearchScope form in P2D.7)
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.SearchScope
    ADD RerankerBudgetCents INT NULL;
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional cap on reranker spend (in cents) per search invocation against this scope. NULL means uncapped — existing behavior. When set, the SearchEngine''s budget guard short-circuits any reranker call whose projected cost would push the run total past this value, and accumulates actual post-call cost via each reranker''s CostReporter callback (BaseReRanker.CostReporter). Real-provider rerankers (Cohere, Voyage, OpenAI) report cost; NoopReRanker and BGEReRanker report zero (local / pass-through).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScope',
    @level2type = N'COLUMN', @level2name = N'RerankerBudgetCents';
GO

-- =====================================================================================================================
-- Section 4: Phase 3.1 — SearchExecutionLog
-- (Source: V202604281130__v5.30.x__Add_SearchExecutionLog.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: SearchExecutionLog (RAG+ Phase 3.1)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 3.1, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- One row per search invocation against the SearchEngine. Captures everything
-- the analytics dashboard (Phase 3.3) and per-scope CSV export (Phase 3.4)
-- need to reconstruct usage patterns: scope + user + agent identity, query
-- text, timing, result count, reranker info + cost, status, and per-provider
-- duration / count breakdown in a JSON blob.
--
-- Notes:
--   - Query is nvarchar(max) — some queries are long (full sentences, snippets)
--   - All FKs nullable because some invocations come from anonymized callers
--     and not every search uses a reranker / scope / agent identity
--   - ProvidersJSON is nvarchar(max) holding an array of {Provider, DurationMs,
--     ResultCount, ErrorMessage}
--   - No __mj_* timestamp columns, no manual FK indexes (CodeGen handles)
--   - No seed data
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.SearchExecutionLog (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NULL,
    UserID UNIQUEIDENTIFIER NULL,
    AIAgentID UNIQUEIDENTIFIER NULL,
    Query NVARCHAR(MAX) NOT NULL,
    TotalDurationMs INT NOT NULL,
    ResultCount INT NOT NULL DEFAULT 0,
    RerankerName NVARCHAR(100) NULL,
    RerankerCostCents DECIMAL(10, 4) NULL,
    Status NVARCHAR(20) NOT NULL,
    FailureReason NVARCHAR(500) NULL,
    ProvidersJSON NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchExecutionLog PRIMARY KEY (ID),
    CONSTRAINT FK_SearchExecutionLog_SearchScope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID),
    CONSTRAINT FK_SearchExecutionLog_User FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_SearchExecutionLog_AIAgent FOREIGN KEY (AIAgentID)
        REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT CK_SearchExecutionLog_Status
        CHECK (Status IN (N'Success', N'Failure', N'Forbidden'))
);
GO

-- Extended properties (column descriptions feed CodeGen's TSDoc on the entity wrapper)

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One row per SearchEngine.search invocation. Populated by SearchEngine''s post-fusion logging hook (Phase 3.2). Read by the Knowledge Hub Search Analytics dashboard (Phase 3.3) and the per-scope tuning CSV export (Phase 3.4).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The SearchScope this invocation targeted. NULL for unscoped global search.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'SearchScopeID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The User who initiated the search. NULL for system / unauthenticated callers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'UserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The AIAgent identity if the search was invoked from an agent (e.g. ScopedSearchAction). NULL for direct human-initiated searches.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'AIAgentID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Raw query string the user / agent submitted. NVARCHAR(MAX) because some queries are long (full sentences, snippets). Stored verbatim for analytics — do NOT rely on this for permission decisions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'Query';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'End-to-end search duration in milliseconds, measured at the SearchEngine.search call boundary (provider runs + fusion + rerank + permission filter + enrichment).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'TotalDurationMs';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of results returned to the caller after permission filtering, deduplication, and score-threshold trimming. Use this as the hit-rate denominator (rows where ResultCount > 0).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'ResultCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'BaseReRanker.Name of the reranker that ran (e.g. ''Cohere'', ''Voyage'', ''OpenAI'', ''BGE'', ''NoopReRanker''). NULL when no rerank stage executed for this invocation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'RerankerName';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total reranker spend in cents for this invocation, populated from the BaseReRanker.CostReporter callback via RerankerBudgetGuard. NULL when no rerank ran or no real-provider cost was incurred (Noop / BGE).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'RerankerCostCents';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Outcome of the search: ''Success'' (results returned, possibly empty), ''Failure'' (an exception bubbled out — see FailureReason), ''Forbidden'' (the caller lacked SearchScopePermission for the requested scope). Constrained by CK_SearchExecutionLog_Status.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short human-readable failure reason when Status = ''Failure'' or ''Forbidden''. NULL on success.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'FailureReason';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of per-provider breakdown entries: [{"Provider":"Vector","DurationMs":123,"ResultCount":5,"ErrorMessage":null}, ...]. Used by the analytics dashboard for p50/p95 latency-by-provider charts and to spot consistently slow providers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchExecutionLog',
    @level2type = N'COLUMN', @level2name = N'ProvidersJSON';
GO

-- =====================================================================================================================
-- Section 5: Phase 4.4 — SearchScopeTestQuery
-- (Source: V202604281200__v5.30.x__Add_SearchScopeTestQuery.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: SearchScopeTestQuery (RAG+ Phase 4.4)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 4.4, ~/.claude/plans/make-a-plan-for-buzzing-sky.md
-- =============================================================================
-- Per-scope canonical test queries for offline tuning. Lets a scope author
-- save a small set of representative queries and re-run them after a config
-- change (reranker swap, weight adjustment, scope-template edit) to compare
-- before/after.
--
-- Notes:
--   - No __mj_* timestamp columns, no manual FK indexes (CodeGen owns)
--   - No seed data (admins author rows through the SearchScope form)
-- =============================================================================

CREATE TABLE ${flyway:defaultSchema}.SearchScopeTestQuery (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SearchScopeID UNIQUEIDENTIFIER NOT NULL,
    Label NVARCHAR(200) NOT NULL,
    Query NVARCHAR(MAX) NOT NULL,
    ExpectedTopResultEntity NVARCHAR(255) NULL,
    ExpectedTopResultRecordID UNIQUEIDENTIFIER NULL,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchScopeTestQuery PRIMARY KEY (ID),
    CONSTRAINT FK_SearchScopeTestQuery_SearchScope FOREIGN KEY (SearchScopeID)
        REFERENCES ${flyway:defaultSchema}.SearchScope(ID)
);
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Canonical test queries owned by a SearchScope. Used by scope authors to validate tuning changes — re-run a saved query after swapping the reranker or adjusting fusion weights and compare results to the prior run.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The SearchScope this test query belongs to. Cascade-restricted via FK so accidental scope deletion preserves test history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'SearchScopeID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short human-readable label for the test query, shown in the form''s test-query grid (e.g. "VIP customer escalation", "expense reimbursement policy").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'Label';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The query text itself. NVARCHAR(MAX) because canonical queries can be full sentences or chunks of natural-language context.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'Query';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional MJ entity name (e.g. "Contacts", "Documents") of the expected top result. When set together with ExpectedTopResultRecordID, lets the test runner assert that the tuned scope returns the right record at rank #1 — a regression tripwire for fusion / reranker changes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'ExpectedTopResultEntity';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional record ID of the expected top result, paired with ExpectedTopResultEntity. NULL = no assertion (the query is exploratory).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'ExpectedTopResultRecordID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form notes explaining why this query is canonical or what edge case it represents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchScopeTestQuery',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO

-- =====================================================================================================================
-- Section 6: Post-hoc — SearchScopePermission unique constraints
-- (Source: V202604291522__v5.30.x__Fix_SearchScopePermission_UniqueConstraints.sql)
-- =====================================================================================================================

-- =============================================================================
-- Migration: Fix SearchScopePermission unique constraints (filtered indexes)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 2A.2 (correction to V202604280730)
-- =============================================================================
-- The original migration (V202604280730__v5.30.x__Add_SearchScopePermission.sql)
-- created two unique CONSTRAINTS:
--
--   UQ_SearchScopePermission_User UNIQUE (SearchScopeID, UserID)
--   UQ_SearchScopePermission_Role UNIQUE (SearchScopeID, RoleID)
--
-- Intent: prevent duplicate user grants and duplicate role grants per scope.
--
-- Bug: SQL Server's UNIQUE CONSTRAINT semantics treat NULL as a value for
-- equality, so once a row exists with `RoleID = NULL` (every user grant), no
-- second user grant can be added on the same scope (both have RoleID=NULL,
-- collision). The same problem applies symmetrically to UserID=NULL on role
-- grants. Re-walking SEARCH_USAGE.md §5.1 surfaced this — adding a second
-- user grant after the auto-Manage grant fails with
-- "Violation of UNIQUE KEY constraint UQ_SearchScopePermission_Role".
--
-- Fix: drop the constraints and replace each with a FILTERED unique index that
-- only enforces uniqueness when the relevant ID is non-NULL. This preserves
-- the no-duplicates intent while allowing arbitrarily many user grants
-- (RoleID=NULL) and arbitrarily many role grants (UserID=NULL) per scope.
--
-- Note: filtered unique indexes are functionally equivalent to UNIQUE
-- CONSTRAINTs but are more permissive on NULLs. CodeGen treats them the same
-- way for entity metadata.
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.SearchScopePermission
    DROP CONSTRAINT UQ_SearchScopePermission_User;

ALTER TABLE ${flyway:defaultSchema}.SearchScopePermission
    DROP CONSTRAINT UQ_SearchScopePermission_Role;

CREATE UNIQUE INDEX UQ_SearchScopePermission_User
    ON ${flyway:defaultSchema}.SearchScopePermission (SearchScopeID, UserID)
    WHERE UserID IS NOT NULL;

CREATE UNIQUE INDEX UQ_SearchScopePermission_Role
    ON ${flyway:defaultSchema}.SearchScopePermission (SearchScopeID, RoleID)
    WHERE RoleID IS NOT NULL;




-- =====================================================================================================================
-- =====================================================================================================================
-- =====================================================================================================================
--
--                     END OF HAND-AUTHORED DDL
--
--          Below: CodeGen-generated regenerations of entity metadata, views, sprocs,
--                  and permission grants for the schema changes above.
--
-- =====================================================================================================================
-- =====================================================================================================================
-- =====================================================================================================================

 








-- CODE GEN RUN
/* SQL generated to create new entity MJ: Search Scopes */

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
         '3f83c084-859f-49c3-a8a0-4693e0777be8',
         'MJ: Search Scopes',
         'Search Scopes',
         'A named, reusable boundary defining WHICH content participates in a search (providers, external indexes, entities, storage accounts). Combined with a runtime SearchContext, it enables multi-tenant, permission-aware, agent-friendly retrieval. See plans/search-scopes-rag-plus.md.',
         NULL,
         'SearchScope',
         'vwSearchScopes',
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
      );

/* SQL generated to add new entity MJ: Search Scopes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3f83c084-859f-49c3-a8a0-4693e0777be8', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scopes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f83c084-859f-49c3-a8a0-4693e0777be8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scopes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f83c084-859f-49c3-a8a0-4693e0777be8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scopes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3f83c084-859f-49c3-a8a0-4693e0777be8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Search Scope Providers */

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
         '211dd116-32c7-43b4-b147-418f76b0e0e3',
         'MJ: Search Scope Providers',
         'Search Scope Providers',
         'Controls which SearchProviders participate in a given SearchScope. Each row enables one provider within one scope, with optional overrides.',
         NULL,
         'SearchScopeProvider',
         'vwSearchScopeProviders',
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
      );

/* SQL generated to add new entity MJ: Search Scope Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '211dd116-32c7-43b4-b147-418f76b0e0e3', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('211dd116-32c7-43b4-b147-418f76b0e0e3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('211dd116-32c7-43b4-b147-418f76b0e0e3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('211dd116-32c7-43b4-b147-418f76b0e0e3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Search Scope External Indexes */

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
         '3b80a286-d1e1-45c2-9648-c850009e1adb',
         'MJ: Search Scope External Indexes',
         'Search Scope External Indexes',
         'Scoped external/provider-owned indexes. Generic — covers vector stores (Pinecone, Qdrant, PGVector) and text/hybrid engines (Elasticsearch, Typesense, Azure AI Search, OpenSearch). A single scope can mix types; each row is consumed only by the provider matching its IndexType.',
         NULL,
         'SearchScopeExternalIndex',
         'vwSearchScopeExternalIndexes',
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
      );

/* SQL generated to add new entity MJ: Search Scope External Indexes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3b80a286-d1e1-45c2-9648-c850009e1adb', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope External Indexes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3b80a286-d1e1-45c2-9648-c850009e1adb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope External Indexes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3b80a286-d1e1-45c2-9648-c850009e1adb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope External Indexes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3b80a286-d1e1-45c2-9648-c850009e1adb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Search Scope Entities */

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
         '20bcabec-413f-4985-8f5a-6bc262e75f81',
         'MJ: Search Scope Entities',
         'Search Scope Entities',
         'Controls which entities participate in entity and full-text search within a scope, with optional per-entity filter and user-search-string overrides.',
         NULL,
         'SearchScopeEntity',
         'vwSearchScopeEntities',
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
      );

/* SQL generated to add new entity MJ: Search Scope Entities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '20bcabec-413f-4985-8f5a-6bc262e75f81', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Entities for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('20bcabec-413f-4985-8f5a-6bc262e75f81', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Entities for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('20bcabec-413f-4985-8f5a-6bc262e75f81', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Entities for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('20bcabec-413f-4985-8f5a-6bc262e75f81', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Search Scope Storage Accounts */

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
         'ed43d812-86d7-42f6-a2a2-2e657acaede2',
         'MJ: Search Scope Storage Accounts',
         'Search Scope Storage Accounts',
         'Controls which file storage accounts/folders participate in a scope.',
         NULL,
         'SearchScopeStorageAccount',
         'vwSearchScopeStorageAccounts',
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
      );

/* SQL generated to add new entity MJ: Search Scope Storage Accounts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ed43d812-86d7-42f6-a2a2-2e657acaede2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Storage Accounts for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed43d812-86d7-42f6-a2a2-2e657acaede2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Storage Accounts for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed43d812-86d7-42f6-a2a2-2e657acaede2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Storage Accounts for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed43d812-86d7-42f6-a2a2-2e657acaede2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Agent Search Scopes */

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
         'c1406bfb-9351-4bf5-966a-70b9a5d82166',
         'MJ: AI Agent Search Scopes',
         'AI Agent Search Scopes',
         'Many-to-many between agents and search scopes, with phase and scheduling control. Drives both pre-execution RAG and agent-invoked scoped search.',
         NULL,
         'AIAgentSearchScope',
         'vwAIAgentSearchScopes',
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
      );

/* SQL generated to add new entity MJ: AI Agent Search Scopes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c1406bfb-9351-4bf5-966a-70b9a5d82166', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Search Scopes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c1406bfb-9351-4bf5-966a-70b9a5d82166', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Search Scopes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c1406bfb-9351-4bf5-966a-70b9a5d82166', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Search Scopes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c1406bfb-9351-4bf5-966a-70b9a5d82166', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Search Scope Permissions */

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
         'b90fab4e-0336-407a-b6ae-a49dea84d083',
         'MJ: Search Scope Permissions',
         'Search Scope Permissions',
         'Per-user or per-role permission grant on a SearchScope. Exactly one of UserID or RoleID is set on each row; the other is NULL. PermissionLevel is one of None, Read, Search, Manage. Combined with AIAgent.SearchScopeAccess for agent-side fallbacks via the SearchScopePermissionResolver.',
         NULL,
         'SearchScopePermission',
         'vwSearchScopePermissions',
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
      );

/* SQL generated to add new entity MJ: Search Scope Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b90fab4e-0336-407a-b6ae-a49dea84d083', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b90fab4e-0336-407a-b6ae-a49dea84d083', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b90fab4e-0336-407a-b6ae-a49dea84d083', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b90fab4e-0336-407a-b6ae-a49dea84d083', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Search Execution Logs */

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
         '530982b5-5556-483a-a4d7-338a19e53548',
         'MJ: Search Execution Logs',
         'Search Execution Logs',
         'One row per SearchEngine.search invocation. Populated by SearchEngine''s post-fusion logging hook (Phase 3.2). Read by the Knowledge Hub Search Analytics dashboard (Phase 3.3) and the per-scope tuning CSV export (Phase 3.4).',
         NULL,
         'SearchExecutionLog',
         'vwSearchExecutionLogs',
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
      );

/* SQL generated to add new entity MJ: Search Execution Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '530982b5-5556-483a-a4d7-338a19e53548', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Execution Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('530982b5-5556-483a-a4d7-338a19e53548', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Execution Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('530982b5-5556-483a-a4d7-338a19e53548', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Execution Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('530982b5-5556-483a-a4d7-338a19e53548', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Search Scope Test Queries */

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
         '04ad87e6-eb56-49b7-b9e2-8f5e44458f27',
         'MJ: Search Scope Test Queries',
         'Search Scope Test Queries',
         'Canonical test queries owned by a SearchScope. Used by scope authors to validate tuning changes — re-run a saved query after swapping the reranker or adjusting fusion weights and compare results to the prior run.',
         NULL,
         'SearchScopeTestQuery',
         'vwSearchScopeTestQueries',
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
      );

/* SQL generated to add new entity MJ: Search Scope Test Queries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '04ad87e6-eb56-49b7-b9e2-8f5e44458f27', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('04ad87e6-eb56-49b7-b9e2-8f5e44458f27', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('04ad87e6-eb56-49b7-b9e2-8f5e44458f27', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Search Scope Test Queries for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('04ad87e6-eb56-49b7-b9e2-8f5e44458f27', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeStorageAccount] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
UPDATE [${flyway:defaultSchema}].[SearchScopeStorageAccount] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeStorageAccount] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeStorageAccount] ADD CONSTRAINT [DF___mj_SearchScopeStorageAccount___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeStorageAccount] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
UPDATE [${flyway:defaultSchema}].[SearchScopeStorageAccount] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeStorageAccount] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeStorageAccount] ADD CONSTRAINT [DF___mj_SearchScopeStorageAccount___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
UPDATE [${flyway:defaultSchema}].[SearchExecutionLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog] ADD CONSTRAINT [DF___mj_SearchExecutionLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
UPDATE [${flyway:defaultSchema}].[SearchExecutionLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog] ADD CONSTRAINT [DF___mj_SearchExecutionLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeProvider] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
UPDATE [${flyway:defaultSchema}].[SearchScopeProvider] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeProvider] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeProvider] ADD CONSTRAINT [DF___mj_SearchScopeProvider___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeProvider] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
UPDATE [${flyway:defaultSchema}].[SearchScopeProvider] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeProvider] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeProvider] ADD CONSTRAINT [DF___mj_SearchScopeProvider___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScope */
ALTER TABLE [${flyway:defaultSchema}].[SearchScope] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScope */
UPDATE [${flyway:defaultSchema}].[SearchScope] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScope */
ALTER TABLE [${flyway:defaultSchema}].[SearchScope] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScope */
ALTER TABLE [${flyway:defaultSchema}].[SearchScope] ADD CONSTRAINT [DF___mj_SearchScope___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScope */
ALTER TABLE [${flyway:defaultSchema}].[SearchScope] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScope */
UPDATE [${flyway:defaultSchema}].[SearchScope] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScope */
ALTER TABLE [${flyway:defaultSchema}].[SearchScope] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScope */
ALTER TABLE [${flyway:defaultSchema}].[SearchScope] ADD CONSTRAINT [DF___mj_SearchScope___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeEntity] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
UPDATE [${flyway:defaultSchema}].[SearchScopeEntity] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeEntity] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeEntity] ADD CONSTRAINT [DF___mj_SearchScopeEntity___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeEntity] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
UPDATE [${flyway:defaultSchema}].[SearchScopeEntity] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeEntity] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeEntity */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeEntity] ADD CONSTRAINT [DF___mj_SearchScopeEntity___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSearchScope] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
UPDATE [${flyway:defaultSchema}].[AIAgentSearchScope] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSearchScope] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSearchScope] ADD CONSTRAINT [DF___mj_AIAgentSearchScope___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSearchScope] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
UPDATE [${flyway:defaultSchema}].[AIAgentSearchScope] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSearchScope] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSearchScope */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSearchScope] ADD CONSTRAINT [DF___mj_AIAgentSearchScope___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
UPDATE [${flyway:defaultSchema}].[SearchScopeTestQuery] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD CONSTRAINT [DF___mj_SearchScopeTestQuery___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
UPDATE [${flyway:defaultSchema}].[SearchScopeTestQuery] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeTestQuery */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeTestQuery] ADD CONSTRAINT [DF___mj_SearchScopeTestQuery___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
UPDATE [${flyway:defaultSchema}].[SearchScopePermission] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD CONSTRAINT [DF___mj_SearchScopePermission___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
UPDATE [${flyway:defaultSchema}].[SearchScopePermission] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopePermission */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission] ADD CONSTRAINT [DF___mj_SearchScopePermission___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeExternalIndex] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
UPDATE [${flyway:defaultSchema}].[SearchScopeExternalIndex] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeExternalIndex] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeExternalIndex] ADD CONSTRAINT [DF___mj_SearchScopeExternalIndex___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeExternalIndex] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
UPDATE [${flyway:defaultSchema}].[SearchScopeExternalIndex] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeExternalIndex] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
ALTER TABLE [${flyway:defaultSchema}].[SearchScopeExternalIndex] ADD CONSTRAINT [DF___mj_SearchScopeExternalIndex___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '948e9c24-c50e-47bf-8a93-d4abaa0bbbbb' OR (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'SearchScopeAccess')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '948e9c24-c50e-47bf-8a93-d4abaa0bbbbb',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: MJ: AI Agents
            100139,
            'SearchScopeAccess',
            'Search Scope Access',
            'Controls the agent''s search capability. All = may use any scope including Global; search action does not restrict. Assigned = may use ONLY scopes explicitly linked via AIAgentSearchScope; scoped search action enforces this. None = agent has no search capability; the scoped search action rejects all requests.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'None',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0dfcf074-13a3-4068-b5d9-6032d424d112' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0dfcf074-13a3-4068-b5d9-6032d424d112',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32221c7e-325d-4afb-b7a5-3b0f5f52834d' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '32221c7e-325d-4afb-b7a5-3b0f5f52834d',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
            100002,
            'SearchScopeID',
            'Search Scope ID',
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
            0,
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd032d1e-1b51-48ba-ace1-aef987c7f7ab' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = 'FileStorageAccountID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'bd032d1e-1b51-48ba-ace1-aef987c7f7ab',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
            100003,
            'FileStorageAccountID',
            'File Storage Account ID',
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
            0,
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6255f1d5-a755-4355-a34c-cf89e18f4ba6' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = 'FolderPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6255f1d5-a755-4355-a34c-cf89e18f4ba6',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
            100004,
            'FolderPath',
            'Folder Path',
            'Optional folder path restriction. NULL = entire storage account. Example: /policies/hr/. Rendered as a Nunjucks template with SearchContext variables so platforms can do per-tenant folder routing like /tenants/{{ context.PrimaryScopeRecordID }}/.',
            'nvarchar',
            2000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3197e4b7-b5ec-4cef-b6f7-bfce3b292f53' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3197e4b7-b5ec-4cef-b6f7-bfce3b292f53',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b6805c1-bbd9-47e1-a678-6c9525ac5449' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5b6805c1-bbd9-47e1-a678-6c9525ac5449',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4322aa22-d7bc-485d-9196-3d5b6de3185d' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '4322aa22-d7bc-485d-9196-3d5b6de3185d',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0497a66-b889-4b67-bf77-1bb7a21754cf' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f0497a66-b889-4b67-bf77-1bb7a21754cf',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100002,
            'SearchScopeID',
            'Search Scope ID',
            'The SearchScope this invocation targeted. NULL for unscoped global search.',
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
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '17d7ab0c-2ecc-4bed-9618-dd92f465d25b' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '17d7ab0c-2ecc-4bed-9618-dd92f465d25b',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100003,
            'UserID',
            'User ID',
            'The User who initiated the search. NULL for system / unauthenticated callers.',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ac56098-a8c6-432d-a5a2-2c8c40e5ad1d' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'AIAgentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6ac56098-a8c6-432d-a5a2-2c8c40e5ad1d',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100004,
            'AIAgentID',
            'AI Agent ID',
            'The AIAgent identity if the search was invoked from an agent (e.g. ScopedSearchAction). NULL for direct human-initiated searches.',
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
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13617353-79f1-409b-aa4f-9fd96a5a7aad' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'Query')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '13617353-79f1-409b-aa4f-9fd96a5a7aad',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100005,
            'Query',
            'Query',
            'Raw query string the user / agent submitted. NVARCHAR(MAX) because some queries are long (full sentences, snippets). Stored verbatim for analytics — do NOT rely on this for permission decisions.',
            'nvarchar',
            -1,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff77dd4a-6bfc-4ae3-9e61-039d9b96941f' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'TotalDurationMs')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'ff77dd4a-6bfc-4ae3-9e61-039d9b96941f',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100006,
            'TotalDurationMs',
            'Total Duration Ms',
            'End-to-end search duration in milliseconds, measured at the SearchEngine.search call boundary (provider runs + fusion + rerank + permission filter + enrichment).',
            'int',
            4,
            10,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5906c5c-b5bc-48b2-a819-746cd09e913b' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'ResultCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c5906c5c-b5bc-48b2-a819-746cd09e913b',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100007,
            'ResultCount',
            'Result Count',
            'Number of results returned to the caller after permission filtering, deduplication, and score-threshold trimming. Use this as the hit-rate denominator (rows where ResultCount > 0).',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccb15200-656c-4ea2-972d-34f48f9f78e4' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'RerankerName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'ccb15200-656c-4ea2-972d-34f48f9f78e4',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100008,
            'RerankerName',
            'Reranker Name',
            'BaseReRanker.Name of the reranker that ran (e.g. ''Cohere'', ''Voyage'', ''OpenAI'', ''BGE'', ''NoopReRanker''). NULL when no rerank stage executed for this invocation.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72bee633-f344-4bb1-874b-93e551ae60da' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'RerankerCostCents')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '72bee633-f344-4bb1-874b-93e551ae60da',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100009,
            'RerankerCostCents',
            'Reranker Cost Cents',
            'Total reranker spend in cents for this invocation, populated from the BaseReRanker.CostReporter callback via RerankerBudgetGuard. NULL when no rerank ran or no real-provider cost was incurred (Noop / BGE).',
            'decimal',
            9,
            10,
            4,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8af906f8-8e8c-423e-b7e9-6e2157823cab' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8af906f8-8e8c-423e-b7e9-6e2157823cab',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100010,
            'Status',
            'Status',
            'Outcome of the search: ''Success'' (results returned, possibly empty), ''Failure'' (an exception bubbled out — see FailureReason), ''Forbidden'' (the caller lacked SearchScopePermission for the requested scope). Constrained by CK_SearchExecutionLog_Status.',
            'nvarchar',
            40,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d69e7a8-1917-4231-a697-a5a5c9788d0e' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'FailureReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9d69e7a8-1917-4231-a697-a5a5c9788d0e',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100011,
            'FailureReason',
            'Failure Reason',
            'Short human-readable failure reason when Status = ''Failure'' or ''Forbidden''. NULL on success.',
            'nvarchar',
            1000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f7fceec-be05-4ad3-b4c2-998c087dca75' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'ProvidersJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3f7fceec-be05-4ad3-b4c2-998c087dca75',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100012,
            'ProvidersJSON',
            'Providers JSON',
            'JSON array of per-provider breakdown entries: [{"Provider":"Vector","DurationMs":123,"ResultCount":5,"ErrorMessage":null}, ...]. Used by the analytics dashboard for p50/p95 latency-by-provider charts and to spot consistently slow providers.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '475fc885-98ca-43a9-89bb-88cd64531c98' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '475fc885-98ca-43a9-89bb-88cd64531c98',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100013,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5eb11d11-e68b-407a-b681-bf711f646638' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5eb11d11-e68b-407a-b681-bf711f646638',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100014,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c14a9b8e-7dc2-4ee8-865a-cb9e310df2e5' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c14a9b8e-7dc2-4ee8-865a-cb9e310df2e5',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '451a3f52-a5df-4099-8bc0-e3588c9220ac' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '451a3f52-a5df-4099-8bc0-e3588c9220ac',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100002,
            'SearchScopeID',
            'Search Scope ID',
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
            0,
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95740918-b09c-4eeb-a612-352bee7b4d1c' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'SearchProviderID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '95740918-b09c-4eeb-a612-352bee7b4d1c',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100003,
            'SearchProviderID',
            'Search Provider ID',
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
            0,
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f66d6720-e1e5-48aa-934f-7c2b3784ef0d' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'Enabled')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f66d6720-e1e5-48aa-934f-7c2b3784ef0d',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100004,
            'Enabled',
            'Enabled',
            'Whether this provider is active for this scope. Lets an admin toggle providers off per-scope without deleting the row.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b907068f-abd3-43a1-bf34-820cd089bc9d' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'MaxResultsOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b907068f-abd3-43a1-bf34-820cd089bc9d',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100005,
            'MaxResultsOverride',
            'Max Results Override',
            'Override the max-results value for this provider within this scope. NULL = use the provider''s default.',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'affa4ea1-e4a3-4e9a-99cc-d9affaefa432' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'ProviderConfigOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'affa4ea1-e4a3-4e9a-99cc-d9affaefa432',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100006,
            'ProviderConfigOverride',
            'Provider Config Override',
            'JSON override for provider-specific configuration within this scope. Provider interprets.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58e855e8-f804-4a0e-b0ac-722ec76941d8' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'QueryTransformTemplateID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '58e855e8-f804-4a0e-b0ac-722ec76941d8',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100007,
            'QueryTransformTemplateID',
            'Query Transform Template ID',
            'Optional FK to Templates. When set, the user/agent query is rewritten through this Template before being sent to this provider. Lets vector providers get a chunk-shaped rewrite while FTS providers get keyword extraction within the same scope. Resolution order: this > AIAgentSearchScope.QueryTemplateID > raw lastUserMessage.',
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
            '48248F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f94a390-0411-4581-aef7-5384b72ee79d' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '1f94a390-0411-4581-aef7-5384b72ee79d',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100008,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3efd97cc-7ffa-4a58-a5b7-b31e44fbef36' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3efd97cc-7ffa-4a58-a5b7-b31e44fbef36',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100009,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf722abd-e0ac-4791-a694-1a5c308844a2' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cf722abd-e0ac-4791-a694-1a5c308844a2',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b01cc6b5-03a8-46d2-8c7f-b6f9dbb4fef2' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b01cc6b5-03a8-46d2-8c7f-b6f9dbb4fef2',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100002,
            'Name',
            'Name',
            'Human-readable scope name (e.g., "HR Policies", "Engineering Docs"). Unique across the system.',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c71ab7f-5318-42c6-b34f-5d6ef4462c90' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7c71ab7f-5318-42c6-b34f-5d6ef4462c90',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100003,
            'Description',
            'Description',
            'Detailed description of what this scope covers. Surfaced to agents in the available-scopes prompt injection so the LLM can choose a scope.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c639cb34-93b2-45fd-a8b6-197f01f30da3' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'Icon')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c639cb34-93b2-45fd-a8b6-197f01f30da3',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100004,
            'Icon',
            'Icon',
            'Font Awesome (or equivalent) icon class used by the scope selector UI.',
            'nvarchar',
            400,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84d4b55f-4270-4c1a-8e3e-b5f6e8879b5b' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'IsGlobal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '84d4b55f-4270-4c1a-8e3e-b5f6e8879b5b',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100005,
            'IsGlobal',
            'Is Global',
            'If true, this scope includes everything (equivalent to no scope filtering). Exactly one Global scope should exist; it is seeded via metadata sync.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4a044ab-961d-4100-8e92-7bb10f8433cd' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'IsDefault')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a4a044ab-961d-4100-8e92-7bb10f8433cd',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100006,
            'IsDefault',
            'Is Default',
            'If true, this is the default scope for users/agents that do not specify one.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a515dcd2-c9cd-471f-a6f2-2db35d3c5c03' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'OwnerUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a515dcd2-c9cd-471f-a6f2-2db35d3c5c03',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100007,
            'OwnerUserID',
            'Owner User ID',
            'NULL = organization-wide scope. Set = personal scope owned by this user (visible/usable only by that user unless explicitly shared).',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cee83cdc-cd11-4b85-8ca0-9f5841cc883f' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cee83cdc-cd11-4b85-8ca0-9f5841cc883f',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100008,
            'Status',
            'Status',
            'Lifecycle status. Only Active scopes are considered at query time.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '030df56e-9df6-4e5a-ae54-6c00c09356c5' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'StartAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '030df56e-9df6-4e5a-ae54-6c00c09356c5',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100009,
            'StartAt',
            'Start At',
            'Optional time-window activation. Scope is inactive before StartAt. NULL = immediately active.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0262fc04-f9a2-42bf-a0a4-7028bf1ae80e' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'EndAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0262fc04-f9a2-42bf-a0a4-7028bf1ae80e',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100010,
            'EndAt',
            'End At',
            'Optional time-window deactivation. Scope is inactive after EndAt. NULL = no expiry.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9641ca58-b2df-48ce-b3ac-976c9e7f63d1' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'ScopeConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9641ca58-b2df-48ce-b3ac-976c9e7f63d1',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100011,
            'ScopeConfig',
            'Scope Config',
            'JSON configuration for advanced scope behavior. Recognized keys: rrfK (RRF k parameter), fusionWeights (per-provider weights), reRanker (optional re-ranker stage config: driverClass, inputTopN, outputTopN, config), permissionOverfetchFactor.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7183a757-830f-482e-9e41-77e5e641b814' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'SearchContextConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7183a757-830f-482e-9e41-77e5e641b814',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100012,
            'SearchContextConfig',
            'Search Context Config',
            'JSON defining available multi-tenant SearchContext dimensions, inheritance modes, and validation rules. Uses the SecondaryScopeConfig structure shared with the agent memory system (@memberjunction/ai-core-plus). NULL = scope is not multi-tenant aware.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9dea41dd-e375-4d15-9a9a-4136ffc35194' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'RerankerBudgetCents')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9dea41dd-e375-4d15-9a9a-4136ffc35194',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100013,
            'RerankerBudgetCents',
            'Reranker Budget Cents',
            'Optional cap on reranker spend (in cents) per search invocation against this scope. NULL means uncapped — existing behavior. When set, the SearchEngine''s budget guard short-circuits any reranker call whose projected cost would push the run total past this value, and accumulates actual post-call cost via each reranker''s CostReporter callback (BaseReRanker.CostReporter). Real-provider rerankers (Cohere, Voyage, OpenAI) report cost; NoopReRanker and BGEReRanker report zero (local / pass-through).',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b481edf6-17d5-4dee-925c-fe300eef446f' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b481edf6-17d5-4dee-925c-fe300eef446f',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100014,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'daac5cc2-1733-4e8a-9510-df26dd36d2f7' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'daac5cc2-1733-4e8a-9510-df26dd36d2f7',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100015,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1bd7c23c-8241-4e1a-b247-a8f14e32bc19' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '1bd7c23c-8241-4e1a-b247-a8f14e32bc19',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edbc9655-6e2e-42af-bf84-aed9da27c950' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'edbc9655-6e2e-42af-bf84-aed9da27c950',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
            100002,
            'SearchScopeID',
            'Search Scope ID',
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
            0,
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '04d1e6ab-0ea1-44f8-932a-56359cea29b6' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '04d1e6ab-0ea1-44f8-932a-56359cea29b6',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
            100003,
            'EntityID',
            'Entity ID',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94f3fc15-08c6-4fe2-ac3b-d234dfffabbe' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = 'ExtraFilter')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '94f3fc15-08c6-4fe2-ac3b-d234dfffabbe',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
            100004,
            'ExtraFilter',
            'Extra Filter',
            'Optional SQL filter applied to this entity''s search within this scope. Example: Status=''Published'' AND DepartmentID=''abc''. Rendered as a Nunjucks template with SearchContext variables for multi-tenant filtering.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '441d9670-ae89-4f60-aa1f-559e58b84ca0' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = 'UserSearchString')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '441d9670-ae89-4f60-aa1f-559e58b84ca0',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
            100005,
            'UserSearchString',
            'User Search String',
            'Optional override for the UserSearchString passed to RunView for this entity within this scope. Nunjucks template (e.g., "{{ query }} AND type:policy"). NULL = pass the user''s actual query through as-is.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32b349a9-34ae-4ff5-9381-8b8b3b713488' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '32b349a9-34ae-4ff5-9381-8b8b3b713488',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '894d9770-e13a-4574-9742-6b763edda34d' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '894d9770-e13a-4574-9742-6b763edda34d',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f68ec93d-8cb6-4d35-881c-0dccd4e42db6' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f68ec93d-8cb6-4d35-881c-0dccd4e42db6',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2e7a5d8-b241-48fa-b0ad-979dae320266' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'AgentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a2e7a5d8-b241-48fa-b0ad-979dae320266',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100002,
            'AgentID',
            'Agent ID',
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
            0,
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0e907e7-044e-4298-9bbe-7a2387b855f4' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c0e907e7-044e-4298-9bbe-7a2387b855f4',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100003,
            'SearchScopeID',
            'Search Scope ID',
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
            0,
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5be679c-0809-4adb-ae19-71ce14fa00fd' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'Phase')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd5be679c-0809-4adb-ae19-71ce14fa00fd',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100004,
            'Phase',
            'Phase',
            'When this scope is used: PreExecution (injected as retrieved context before the agent runs), AgentInvoked (callable via the scoped search Action), or Both.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Both',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6ef21b2-cb3c-4d05-8a73-65c55897468c' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e6ef21b2-cb3c-4d05-8a73-65c55897468c',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100005,
            'Status',
            'Status',
            'Lifecycle status. Only Active rows are considered at runtime.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c42e55cf-da62-47f7-9cdc-baf87cf00cfb' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'StartAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c42e55cf-da62-47f7-9cdc-baf87cf00cfb',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100006,
            'StartAt',
            'Start At',
            'Time-windowed activation for this agent-scope assignment. NULL = immediately active.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e12bf45e-e0cd-4188-a221-82c9fc22ebb2' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'EndAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e12bf45e-e0cd-4188-a221-82c9fc22ebb2',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100007,
            'EndAt',
            'End At',
            'Time-windowed deactivation for this agent-scope assignment. NULL = no expiry.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '301ffe95-1405-4200-85c0-e2ee4badde99' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '301ffe95-1405-4200-85c0-e2ee4badde99',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100008,
            'Priority',
            'Priority',
            'Ordering within Phase. Lower = higher priority. Used for pre-execution ordering and as default preference for agent-invoked scope selection.',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '543f7e2c-80e0-4024-9167-667616359f68' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'MaxResults')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '543f7e2c-80e0-4024-9167-667616359f68',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100009,
            'MaxResults',
            'Max Results',
            'Override max results for this scope when used by this agent. NULL = use scope/engine default.',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2eec11ca-4f71-4aef-ac50-97f2372c93b1' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'MinScore')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2eec11ca-4f71-4aef-ac50-97f2372c93b1',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100010,
            'MinScore',
            'Min Score',
            'Override min score threshold (0.0000–1.0000). NULL = use engine default.',
            'decimal',
            5,
            5,
            4,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e8e32952-3858-475f-bfb6-c918d181d270' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'QueryTemplateID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e8e32952-3858-475f-bfb6-c918d181d270',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100011,
            'QueryTemplateID',
            'Query Template ID',
            'FK to Templates. MJ Template used to generate the search query from conversation context (lastUserMessage, recentMessages, payload, etc.). NULL = use lastUserMessage as-is. Can be further specialized per-provider via SearchScopeProvider.QueryTransformTemplateID.',
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
            '48248F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5ce6d24-4c59-4bbb-b2f6-e8f0ffbedd40' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'FusionWeightsOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b5ce6d24-4c59-4bbb-b2f6-e8f0ffbedd40',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100012,
            'FusionWeightsOverride',
            'Fusion Weights Override',
            'JSON override for RRF per-provider fusion weights when this agent uses this scope. Resolution order: AIAgentSearchScope.FusionWeightsOverride > SearchScope.ScopeConfig.fusionWeights > engine defaults. Example: { "vector": 2.0, "fulltext": 1.0, "entity": 1.0 }.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44a7c7b2-7c8a-4199-a08d-c068df677e6b' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'IsDefault')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '44a7c7b2-7c8a-4199-a08d-c068df677e6b',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100013,
            'IsDefault',
            'Is Default',
            'If true, this is the agent''s default scope when no scope is specified in a tool call.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6522a09-72f4-472b-9601-1fc16d475ddc' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a6522a09-72f4-472b-9601-1fc16d475ddc',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100014,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ad7c7cf-b0e7-4d59-898d-0df744f6abe7' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6ad7c7cf-b0e7-4d59-898d-0df744f6abe7',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100015,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f2103b7-2fcf-4bbc-aea2-c53a0bbd3822' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3f2103b7-2fcf-4bbc-aea2-c53a0bbd3822',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cfe7d72f-79d3-4aa9-8469-207c2151c14b' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cfe7d72f-79d3-4aa9-8469-207c2151c14b',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100002,
            'SearchScopeID',
            'Search Scope ID',
            'The SearchScope this test query belongs to. Cascade-restricted via FK so accidental scope deletion preserves test history.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a38c86b-90e6-4b6b-84bd-505f5c079e12' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'Label')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3a38c86b-90e6-4b6b-84bd-505f5c079e12',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100003,
            'Label',
            'Label',
            'Short human-readable label for the test query, shown in the form''s test-query grid (e.g. "VIP customer escalation", "expense reimbursement policy").',
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6de3b564-29da-4a88-a1ea-fd968e86108d' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'Query')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6de3b564-29da-4a88-a1ea-fd968e86108d',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100004,
            'Query',
            'Query',
            'The query text itself. NVARCHAR(MAX) because canonical queries can be full sentences or chunks of natural-language context.',
            'nvarchar',
            -1,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8de8947-b323-4098-9fe6-e06ca34c80c5' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'ExpectedTopResultEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a8de8947-b323-4098-9fe6-e06ca34c80c5',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100005,
            'ExpectedTopResultEntity',
            'Expected Top Result Entity',
            'Optional MJ entity name (e.g. "Contacts", "Documents") of the expected top result. When set together with ExpectedTopResultRecordID, lets the test runner assert that the tuned scope returns the right record at rank #1 — a regression tripwire for fusion / reranker changes.',
            'nvarchar',
            510,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd75cfa63-3b07-4f40-bb28-47c5365dfeda' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'ExpectedTopResultRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd75cfa63-3b07-4f40-bb28-47c5365dfeda',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100006,
            'ExpectedTopResultRecordID',
            'Expected Top Result Record ID',
            'Optional record ID of the expected top result, paired with ExpectedTopResultEntity. NULL = no assertion (the query is exploratory).',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4ade8da-300c-4a10-a142-9680f9882d7c' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e4ade8da-300c-4a10-a142-9680f9882d7c',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100007,
            'Notes',
            'Notes',
            'Free-form notes explaining why this query is canonical or what edge case it represents.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '923c5d6d-bed9-4550-929a-83cd2ff44c0a' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '923c5d6d-bed9-4550-929a-83cd2ff44c0a',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100008,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f4dda5d-0d6b-43ad-a9a6-6569e8038c78' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3f4dda5d-0d6b-43ad-a9a6-6569e8038c78',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100009,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a65342f4-8289-4fe8-84e0-b0ad6abbf27e' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a65342f4-8289-4fe8-84e0-b0ad6abbf27e',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100001,
            'ID',
            'ID',
            'Primary key. Auto-generated.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f4d48ac-a66f-4adf-9dfe-9931eda4b876' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3f4d48ac-a66f-4adf-9dfe-9931eda4b876',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100002,
            'SearchScopeID',
            'Search Scope ID',
            'The SearchScope this permission row applies to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b6000c0-2ada-462a-95db-347997d1b7dd' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0b6000c0-2ada-462a-95db-347997d1b7dd',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100003,
            'UserID',
            'User ID',
            'The user this permission applies to. Mutually exclusive with RoleID — exactly one must be set.',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '806a6bef-8e3a-4957-b122-dd08b62727d2' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'RoleID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '806a6bef-8e3a-4957-b122-dd08b62727d2',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100004,
            'RoleID',
            'Role ID',
            'The role this permission applies to. Mutually exclusive with UserID — exactly one must be set. Permissions granted via roles flow to all users in that role.',
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
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8d0985d-b898-402a-83c8-e9816acd3965' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'PermissionLevel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd8d0985d-b898-402a-83c8-e9816acd3965',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100005,
            'PermissionLevel',
            'Permission Level',
            'Capability granted on this SearchScope. None = explicit deny (overrides role grants), Read = view scope metadata, Search = invoke ScopedSearchAction, Manage = full edit including authoring of permission rows. The resolver picks the highest level when multiple grants apply (direct + role).',
            'nvarchar',
            40,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30576dd7-1752-48bd-85b1-d9655bbb055f' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '30576dd7-1752-48bd-85b1-d9655bbb055f',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26a95bd0-ff2e-420c-afce-f005811f1e47' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '26a95bd0-ff2e-420c-afce-f005811f1e47',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a8d248c-ca1c-4851-9b30-c2f39950d0f0' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7a8d248c-ca1c-4851-9b30-c2f39950d0f0',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c7b0e695-7a9d-4d36-a860-caa0fe743a93' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'SearchScopeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c7b0e695-7a9d-4d36-a860-caa0fe743a93',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100002,
            'SearchScopeID',
            'Search Scope ID',
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
            0,
            '3F83C084-859F-49C3-A8A0-4693E0777BE8',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d7f70e8-e16b-48a7-b0f7-b29355040e84' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'IndexType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5d7f70e8-e16b-48a7-b0f7-b29355040e84',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100003,
            'IndexType',
            'Index Type',
            'Discriminator. Determines which provider class consumes this row: Vector | Elasticsearch | Typesense | AzureAISearch | OpenSearch | Other.',
            'nvarchar',
            80,
            0,
            0,
            0,
            'Vector',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc4c6581-35de-4b31-9049-4f385e83daa4' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'VectorIndexID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cc4c6581-35de-4b31-9049-4f385e83daa4',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100004,
            'VectorIndexID',
            'Vector Index ID',
            'FK to VectorIndex. REQUIRED when IndexType=''Vector''. NULL for all other IndexType values.',
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
            '1D248F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f0cbab5-d960-4621-bb6e-cbc0340f4968' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'ExternalIndexName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7f0cbab5-d960-4621-bb6e-cbc0340f4968',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100005,
            'ExternalIndexName',
            'External Index Name',
            'For non-vector IndexTypes: the remote engine''s index/collection/alias name (e.g., Elasticsearch index "kb_docs_v3", Typesense collection "articles"). NULL for IndexType=''Vector'' (VectorIndexID resolves the name instead).',
            'nvarchar',
            800,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8405e520-f9cc-45a0-86fa-62ba702b706a' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'ExternalIndexConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8405e520-f9cc-45a0-86fa-62ba702b706a',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100006,
            'ExternalIndexConfig',
            'External Index Config',
            'JSON with extra connection/config hints the provider needs (cluster alias, routing key, custom analyzer, etc.). Provider-interpreted.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5494ca26-73e8-47e9-a35f-7ccd0aebaa28' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'MetadataFilter')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5494ca26-73e8-47e9-a35f-7ccd0aebaa28',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100007,
            'MetadataFilter',
            'Metadata Filter',
            'JSON filter expression applied as a native metadata filter on the remote engine. Pinecone/Qdrant/PGVector metadata filter, or Elasticsearch filter DSL, etc. Rendered as a Nunjucks template so SearchContext.PrimaryScopeRecordID and SearchContext.SecondaryScopes.* can be interpolated for multi-tenant filtering.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fbbbd9f-d8f3-4e8a-a8d7-bfec6ce6fe73' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6fbbbd9f-d8f3-4e8a-a8d7-bfec6ce6fe73',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100008,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '062cbf53-a21b-46de-9bce-4a2e0cb5c621' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '062cbf53-a21b-46de-9bce-4a2e0cb5c621',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100009,
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

/* SQL text to insert entity field value with ID 6f1ac0b5-6158-4f2d-b5ab-0850bc25141c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6f1ac0b5-6158-4f2d-b5ab-0850bc25141c', 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4f635292-5f4f-4a44-8b58-6ca94da815f2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f635292-5f4f-4a44-8b58-6ca94da815f2', 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CEE83CDC-CD11-4B85-8CA0-9F5841CC883F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CEE83CDC-CD11-4B85-8CA0-9F5841CC883F';

/* SQL text to insert entity field value with ID 49e613cc-f04b-4bf8-9ac0-378676e408bf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('49e613cc-f04b-4bf8-9ac0-378676e408bf', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 1, 'AzureAISearch', 'AzureAISearch', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9c428c70-9d22-4d99-8069-abd754c3ae01 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9c428c70-9d22-4d99-8069-abd754c3ae01', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 2, 'Elasticsearch', 'Elasticsearch', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 75dd36f9-9a4c-40e1-88b7-b170e39c03cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('75dd36f9-9a4c-40e1-88b7-b170e39c03cb', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 3, 'OpenSearch', 'OpenSearch', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f0a35da1-81dc-45c2-b25c-2d520233cc7c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f0a35da1-81dc-45c2-b25c-2d520233cc7c', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 4, 'Other', 'Other', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b90300bb-98d5-4e87-956f-dffcfe7ea1e7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b90300bb-98d5-4e87-956f-dffcfe7ea1e7', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 5, 'Typesense', 'Typesense', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6032eac6-36cf-4875-8346-f5e95da6382b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6032eac6-36cf-4875-8346-f5e95da6382b', '5D7F70E8-E16B-48A7-B0F7-B29355040E84', 6, 'Vector', 'Vector', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5D7F70E8-E16B-48A7-B0F7-B29355040E84 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5D7F70E8-E16B-48A7-B0F7-B29355040E84';

/* SQL text to insert entity field value with ID e7a3f66e-342d-44b9-91ab-9c24a404419f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e7a3f66e-342d-44b9-91ab-9c24a404419f', 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD', 1, 'AgentInvoked', 'AgentInvoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ffe4cdb4-7c32-43cc-b1cc-35be45c8b595 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ffe4cdb4-7c32-43cc-b1cc-35be45c8b595', 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD', 2, 'Both', 'Both', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9398fbcf-17a0-43e6-b8c2-5845ee3763cf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9398fbcf-17a0-43e6-b8c2-5845ee3763cf', 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD', 3, 'PreExecution', 'PreExecution', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D5BE679C-0809-4ADB-AE19-71CE14FA00FD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D5BE679C-0809-4ADB-AE19-71CE14FA00FD';

/* SQL text to insert entity field value with ID 35f57202-6cf1-47f0-a5b5-c01d5b4da6de */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('35f57202-6cf1-47f0-a5b5-c01d5b4da6de', 'E6EF21B2-CB3C-4D05-8A73-65C55897468C', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9f96f766-1bb9-459a-9459-762b75d16e36 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f96f766-1bb9-459a-9459-762b75d16e36', 'E6EF21B2-CB3C-4D05-8A73-65C55897468C', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E6EF21B2-CB3C-4D05-8A73-65C55897468C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E6EF21B2-CB3C-4D05-8A73-65C55897468C';

/* SQL text to insert entity field value with ID bcbd305f-6ca0-4aef-bd50-6f930e48a09a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bcbd305f-6ca0-4aef-bd50-6f930e48a09a', '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB', 1, 'All', 'All', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID aab0f897-3ba7-41b9-9f27-fc4ad8e70fa7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aab0f897-3ba7-41b9-9f27-fc4ad8e70fa7', '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB', 2, 'Assigned', 'Assigned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a4c7076b-7930-4cde-a8c7-d0b9294f1a95 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a4c7076b-7930-4cde-a8c7-d0b9294f1a95', '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB', 3, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB';

/* SQL text to insert entity field value with ID 17829f93-6077-41ff-abeb-6314e9dc9b51 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('17829f93-6077-41ff-abeb-6314e9dc9b51', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 1, 'Manage', 'Manage', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ba8a2c87-f601-42b0-9b6f-501c52dc4e5e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ba8a2c87-f601-42b0-9b6f-501c52dc4e5e', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dd246eb2-c371-499f-8afe-ca1e4083573c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dd246eb2-c371-499f-8afe-ca1e4083573c', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 3, 'Read', 'Read', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 571d6ba8-858c-4be7-a687-9e936d4e0158 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('571d6ba8-858c-4be7-a687-9e936d4e0158', 'D8D0985D-B898-402A-83C8-E9816ACD3965', 4, 'Search', 'Search', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D8D0985D-B898-402A-83C8-E9816ACD3965 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D8D0985D-B898-402A-83C8-E9816ACD3965';

/* SQL text to insert entity field value with ID 8e0cb348-84a3-4609-ae8b-7a6f11d11292 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8e0cb348-84a3-4609-ae8b-7a6f11d11292', '8AF906F8-8E8C-423E-B7E9-6E2157823CAB', 1, 'Failure', 'Failure', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 35425912-2085-45a3-b733-e85aa2758937 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('35425912-2085-45a3-b733-e85aa2758937', '8AF906F8-8E8C-423E-B7E9-6E2157823CAB', 2, 'Forbidden', 'Forbidden', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8eeda30e-d17c-43d1-895a-36c312330f75 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8eeda30e-d17c-43d1-895a-36c312330f75', '8AF906F8-8E8C-423E-B7E9-6E2157823CAB', 3, 'Success', 'Success', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8AF906F8-8E8C-423E-B7E9-6E2157823CAB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8AF906F8-8E8C-423E-B7E9-6E2157823CAB';


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent Search Scopes (One To Many via AgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'de60ca2a-4688-468a-b306-a6590a548dfc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('de60ca2a-4688-468a-b306-a6590a548dfc', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'AgentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agents -> MJ: Search Execution Logs (One To Many via AIAgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bfcc3a7f-eff1-420b-a634-6d936dcd9692'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bfcc3a7f-eff1-420b-a634-6d936dcd9692', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '530982B5-5556-483A-A4D7-338A19E53548', 'AIAgentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope External Indexes (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '857adbf3-cf9e-4519-bdd3-6dcbfa563202'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('857adbf3-cf9e-4519-bdd3-6dcbfa563202', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'SearchScopeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope Test Queries (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f2384797-6006-40de-8162-7ff2093eb5dc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f2384797-6006-40de-8162-7ff2093eb5dc', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', 'SearchScopeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope Permissions (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f8b5d6f5-3ee9-4aaa-a22d-5e9e74f7ff00'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f8b5d6f5-3ee9-4aaa-a22d-5e9e74f7ff00', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'SearchScopeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope Entities (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bf1651a6-39bf-4f0d-8409-ffb924b4b94e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bf1651a6-39bf-4f0d-8409-ffb924b4b94e', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'SearchScopeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Search Scopes -> MJ: AI Agent Search Scopes (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7a9867cc-2dda-4c7b-aa33-56664f687fd9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7a9867cc-2dda-4c7b-aa33-56664f687fd9', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'SearchScopeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Execution Logs (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd2332f0d-a8ab-4052-99e3-ea8e0a6261b2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d2332f0d-a8ab-4052-99e3-ea8e0a6261b2', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '530982B5-5556-483A-A4D7-338A19E53548', 'SearchScopeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope Storage Accounts (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7b3302fd-732c-4690-bb30-d16b463a4bc5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7b3302fd-732c-4690-bb30-d16b463a4bc5', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'SearchScopeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Search Scopes -> MJ: Search Scope Providers (One To Many via SearchScopeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6af9824c-45c4-4b99-8552-cceab712c5c3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6af9824c-45c4-4b99-8552-cceab712c5c3', '3F83C084-859F-49C3-A8A0-4693E0777BE8', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'SearchScopeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Roles -> MJ: Search Scope Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7574ad59-3af8-45f6-aa8c-12e192b589e3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7574ad59-3af8-45f6-aa8c-12e192b589e3', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'RoleID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Search Scope Entities (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '958ae369-3dc6-4a73-bdc5-8e98f498a463'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('958ae369-3dc6-4a73-bdc5-8e98f498a463', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'EntityID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Search Scope Permissions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9ab2dba6-16dd-4c8c-bc83-b602e86ef7e6'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9ab2dba6-16dd-4c8c-bc83-b602e86ef7e6', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'UserID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Search Scopes (One To Many via OwnerUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '654f7b16-491e-4c9a-993f-248b33d79f1b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('654f7b16-491e-4c9a-993f-248b33d79f1b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'OwnerUserID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Search Execution Logs (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c520ac63-b97e-468f-afc3-a99be76d7510'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c520ac63-b97e-468f-afc3-a99be76d7510', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '530982B5-5556-483A-A4D7-338A19E53548', 'UserID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Vector Indexes -> MJ: Search Scope External Indexes (One To Many via VectorIndexID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8e0008ce-d872-49d0-b23a-d1d04cf13199'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8e0008ce-d872-49d0-b23a-d1d04cf13199', '1D248F34-2837-EF11-86D4-6045BDEE16E6', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'VectorIndexID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Templates -> MJ: AI Agent Search Scopes (One To Many via QueryTemplateID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7f7a4713-ba43-4fc2-882a-272b9a831c0f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7f7a4713-ba43-4fc2-882a-272b9a831c0f', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'QueryTemplateID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Templates -> MJ: Search Scope Providers (One To Many via QueryTransformTemplateID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5e1cd615-b0b2-46b1-97ff-d98948c7a34c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5e1cd615-b0b2-46b1-97ff-d98948c7a34c', '48248F34-2837-EF11-86D4-6045BDEE16E6', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'QueryTransformTemplateID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: File Storage Accounts -> MJ: Search Scope Storage Accounts (One To Many via FileStorageAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bd7b4162-2883-4204-a6b9-ec95dcb26965'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bd7b4162-2883-4204-a6b9-ec95dcb26965', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'FileStorageAccountID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Search Providers -> MJ: Search Scope Providers (One To Many via SearchProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0c10320a-859f-4de5-9d70-c22aa9db261e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0c10320a-859f-4de5-9d70-c22aa9db261e', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'SearchProviderID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AIAgentSearchScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentSearchScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSearchScope_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSearchScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSearchScope_AgentID ON [${flyway:defaultSchema}].[AIAgentSearchScope] ([AgentID]);

-- Index for foreign key SearchScopeID in table AIAgentSearchScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSearchScope_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSearchScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSearchScope_SearchScopeID ON [${flyway:defaultSchema}].[AIAgentSearchScope] ([SearchScopeID]);

-- Index for foreign key QueryTemplateID in table AIAgentSearchScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSearchScope_QueryTemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSearchScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSearchScope_QueryTemplateID ON [${flyway:defaultSchema}].[AIAgentSearchScope] ([QueryTemplateID]);

/* SQL text to update entity field related entity name field map for entity field ID A2E7A5D8-B241-48FA-B0AD-979DAE320266 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A2E7A5D8-B241-48FA-B0AD-979DAE320266', @RelatedEntityNameFieldMap='Agent';

/* SQL text to update entity field related entity name field map for entity field ID C0E907E7-044E-4298-9BBE-7A2387B855F4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C0E907E7-044E-4298-9BBE-7A2387B855F4', @RelatedEntityNameFieldMap='SearchScope';

/* SQL text to update entity field related entity name field map for entity field ID E8E32952-3858-475F-BFB6-C918D181D270 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E8E32952-3858-475F-BFB6-C918D181D270', @RelatedEntityNameFieldMap='QueryTemplate';

/* Base View SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: vwAIAgentSearchScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Search Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentSearchScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentSearchScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentSearchScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSearchScopes]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJTemplate_QueryTemplateID.[Name] AS [QueryTemplate]
FROM
    [${flyway:defaultSchema}].[AIAgentSearchScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [a].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Template] AS MJTemplate_QueryTemplateID
  ON
    [a].[QueryTemplateID] = MJTemplate_QueryTemplateID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSearchScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: Permissions for vwAIAgentSearchScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSearchScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: spCreateAIAgentSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSearchScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentSearchScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSearchScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSearchScope]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @SearchScopeID uniqueidentifier,
    @Phase nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @Priority int = NULL,
    @MaxResults_Clear bit = 0,
    @MaxResults int = NULL,
    @MinScore_Clear bit = 0,
    @MinScore decimal(5, 4) = NULL,
    @QueryTemplateID_Clear bit = 0,
    @QueryTemplateID uniqueidentifier = NULL,
    @FusionWeightsOverride_Clear bit = 0,
    @FusionWeightsOverride nvarchar(MAX) = NULL,
    @IsDefault bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSearchScope]
            (
                [ID],
                [AgentID],
                [SearchScopeID],
                [Phase],
                [Status],
                [StartAt],
                [EndAt],
                [Priority],
                [MaxResults],
                [MinScore],
                [QueryTemplateID],
                [FusionWeightsOverride],
                [IsDefault]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @SearchScopeID,
                ISNULL(@Phase, 'Both'),
                ISNULL(@Status, 'Active'),
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                ISNULL(@Priority, 100),
                CASE WHEN @MaxResults_Clear = 1 THEN NULL ELSE ISNULL(@MaxResults, NULL) END,
                CASE WHEN @MinScore_Clear = 1 THEN NULL ELSE ISNULL(@MinScore, NULL) END,
                CASE WHEN @QueryTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@QueryTemplateID, NULL) END,
                CASE WHEN @FusionWeightsOverride_Clear = 1 THEN NULL ELSE ISNULL(@FusionWeightsOverride, NULL) END,
                ISNULL(@IsDefault, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSearchScope]
            (
                [AgentID],
                [SearchScopeID],
                [Phase],
                [Status],
                [StartAt],
                [EndAt],
                [Priority],
                [MaxResults],
                [MinScore],
                [QueryTemplateID],
                [FusionWeightsOverride],
                [IsDefault]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @SearchScopeID,
                ISNULL(@Phase, 'Both'),
                ISNULL(@Status, 'Active'),
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                ISNULL(@Priority, 100),
                CASE WHEN @MaxResults_Clear = 1 THEN NULL ELSE ISNULL(@MaxResults, NULL) END,
                CASE WHEN @MinScore_Clear = 1 THEN NULL ELSE ISNULL(@MinScore, NULL) END,
                CASE WHEN @QueryTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@QueryTemplateID, NULL) END,
                CASE WHEN @FusionWeightsOverride_Clear = 1 THEN NULL ELSE ISNULL(@FusionWeightsOverride, NULL) END,
                ISNULL(@IsDefault, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSearchScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSearchScope] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Search Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSearchScope] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: spUpdateAIAgentSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSearchScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentSearchScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSearchScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSearchScope]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier = NULL,
    @Phase nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @Priority int = NULL,
    @MaxResults_Clear bit = 0,
    @MaxResults int = NULL,
    @MinScore_Clear bit = 0,
    @MinScore decimal(5, 4) = NULL,
    @QueryTemplateID_Clear bit = 0,
    @QueryTemplateID uniqueidentifier = NULL,
    @FusionWeightsOverride_Clear bit = 0,
    @FusionWeightsOverride nvarchar(MAX) = NULL,
    @IsDefault bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSearchScope]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [SearchScopeID] = ISNULL(@SearchScopeID, [SearchScopeID]),
        [Phase] = ISNULL(@Phase, [Phase]),
        [Status] = ISNULL(@Status, [Status]),
        [StartAt] = CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, [StartAt]) END,
        [EndAt] = CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, [EndAt]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [MaxResults] = CASE WHEN @MaxResults_Clear = 1 THEN NULL ELSE ISNULL(@MaxResults, [MaxResults]) END,
        [MinScore] = CASE WHEN @MinScore_Clear = 1 THEN NULL ELSE ISNULL(@MinScore, [MinScore]) END,
        [QueryTemplateID] = CASE WHEN @QueryTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@QueryTemplateID, [QueryTemplateID]) END,
        [FusionWeightsOverride] = CASE WHEN @FusionWeightsOverride_Clear = 1 THEN NULL ELSE ISNULL(@FusionWeightsOverride, [FusionWeightsOverride]) END,
        [IsDefault] = ISNULL(@IsDefault, [IsDefault])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSearchScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSearchScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSearchScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSearchScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentSearchScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentSearchScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentSearchScope
ON [${flyway:defaultSchema}].[AIAgentSearchScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSearchScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentSearchScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Search Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSearchScope] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Search Scopes
-- Item: spDeleteAIAgentSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSearchScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentSearchScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentSearchScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] TO [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Search Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] TO [cdp_Integration];

/* Index for Foreign Keys for SearchExecutionLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchExecutionLog_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchExecutionLog_SearchScopeID ON [${flyway:defaultSchema}].[SearchExecutionLog] ([SearchScopeID]);

-- Index for foreign key UserID in table SearchExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchExecutionLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchExecutionLog_UserID ON [${flyway:defaultSchema}].[SearchExecutionLog] ([UserID]);

-- Index for foreign key AIAgentID in table SearchExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchExecutionLog_AIAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchExecutionLog_AIAgentID ON [${flyway:defaultSchema}].[SearchExecutionLog] ([AIAgentID]);

/* SQL text to update entity field related entity name field map for entity field ID F0497A66-B889-4B67-BF77-1BB7A21754CF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F0497A66-B889-4B67-BF77-1BB7A21754CF', @RelatedEntityNameFieldMap='SearchScope';

/* SQL text to update entity field related entity name field map for entity field ID 17D7AB0C-2ECC-4BED-9618-DD92F465D25B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='17D7AB0C-2ECC-4BED-9618-DD92F465D25B', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 6AC56098-A8C6-432D-A5A2-2C8C40E5AD1D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6AC56098-A8C6-432D-A5A2-2C8C40E5AD1D', @RelatedEntityNameFieldMap='AIAgent';

/* Base View SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: vwSearchExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Execution Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchExecutionLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchExecutionLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchExecutionLogs]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJUser_UserID.[Name] AS [User],
    MJAIAgent_AIAgentID.[Name] AS [AIAgent]
FROM
    [${flyway:defaultSchema}].[SearchExecutionLog] AS s
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [s].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AIAgentID
  ON
    [s].[AIAgentID] = MJAIAgent_AIAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchExecutionLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: Permissions for vwSearchExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchExecutionLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spCreateSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchExecutionLog]
    @ID uniqueidentifier = NULL,
    @SearchScopeID_Clear bit = 0,
    @SearchScopeID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AIAgentID_Clear bit = 0,
    @AIAgentID uniqueidentifier = NULL,
    @Query nvarchar(MAX),
    @TotalDurationMs int,
    @ResultCount int = NULL,
    @RerankerName_Clear bit = 0,
    @RerankerName nvarchar(100) = NULL,
    @RerankerCostCents_Clear bit = 0,
    @RerankerCostCents decimal(10, 4) = NULL,
    @Status nvarchar(20),
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(500) = NULL,
    @ProvidersJSON_Clear bit = 0,
    @ProvidersJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchExecutionLog]
            (
                [ID],
                [SearchScopeID],
                [UserID],
                [AIAgentID],
                [Query],
                [TotalDurationMs],
                [ResultCount],
                [RerankerName],
                [RerankerCostCents],
                [Status],
                [FailureReason],
                [ProvidersJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @SearchScopeID_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AIAgentID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentID, NULL) END,
                @Query,
                @TotalDurationMs,
                ISNULL(@ResultCount, 0),
                CASE WHEN @RerankerName_Clear = 1 THEN NULL ELSE ISNULL(@RerankerName, NULL) END,
                CASE WHEN @RerankerCostCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerCostCents, NULL) END,
                @Status,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @ProvidersJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProvidersJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchExecutionLog]
            (
                [SearchScopeID],
                [UserID],
                [AIAgentID],
                [Query],
                [TotalDurationMs],
                [ResultCount],
                [RerankerName],
                [RerankerCostCents],
                [Status],
                [FailureReason],
                [ProvidersJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @SearchScopeID_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AIAgentID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentID, NULL) END,
                @Query,
                @TotalDurationMs,
                ISNULL(@ResultCount, 0),
                CASE WHEN @RerankerName_Clear = 1 THEN NULL ELSE ISNULL(@RerankerName, NULL) END,
                CASE WHEN @RerankerCostCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerCostCents, NULL) END,
                @Status,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @ProvidersJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProvidersJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchExecutionLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spUpdateSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchExecutionLog]
    @ID uniqueidentifier,
    @SearchScopeID_Clear bit = 0,
    @SearchScopeID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AIAgentID_Clear bit = 0,
    @AIAgentID uniqueidentifier = NULL,
    @Query nvarchar(MAX) = NULL,
    @TotalDurationMs int = NULL,
    @ResultCount int = NULL,
    @RerankerName_Clear bit = 0,
    @RerankerName nvarchar(100) = NULL,
    @RerankerCostCents_Clear bit = 0,
    @RerankerCostCents decimal(10, 4) = NULL,
    @Status nvarchar(20) = NULL,
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(500) = NULL,
    @ProvidersJSON_Clear bit = 0,
    @ProvidersJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchExecutionLog]
    SET
        [SearchScopeID] = CASE WHEN @SearchScopeID_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeID, [SearchScopeID]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [AIAgentID] = CASE WHEN @AIAgentID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentID, [AIAgentID]) END,
        [Query] = ISNULL(@Query, [Query]),
        [TotalDurationMs] = ISNULL(@TotalDurationMs, [TotalDurationMs]),
        [ResultCount] = ISNULL(@ResultCount, [ResultCount]),
        [RerankerName] = CASE WHEN @RerankerName_Clear = 1 THEN NULL ELSE ISNULL(@RerankerName, [RerankerName]) END,
        [RerankerCostCents] = CASE WHEN @RerankerCostCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerCostCents, [RerankerCostCents]) END,
        [Status] = ISNULL(@Status, [Status]),
        [FailureReason] = CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, [FailureReason]) END,
        [ProvidersJSON] = CASE WHEN @ProvidersJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProvidersJSON, [ProvidersJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchExecutionLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchExecutionLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchExecutionLog
ON [${flyway:defaultSchema}].[SearchExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spDeleteSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchExecutionLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchExecutionLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchExecutionLog] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchExecutionLog] TO [cdp_Integration];

/* Index for Foreign Keys for SearchScopeEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeEntity_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeEntity_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopeEntity] ([SearchScopeID]);

-- Index for foreign key EntityID in table SearchScopeEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeEntity_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeEntity_EntityID ON [${flyway:defaultSchema}].[SearchScopeEntity] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID EDBC9655-6E2E-42AF-BF84-AED9DA27C950 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EDBC9655-6E2E-42AF-BF84-AED9DA27C950', @RelatedEntityNameFieldMap='SearchScope';

/* Index for Foreign Keys for SearchScopeExternalIndex */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeExternalIndex
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeExternalIndex_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeExternalIndex]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeExternalIndex_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopeExternalIndex] ([SearchScopeID]);

-- Index for foreign key VectorIndexID in table SearchScopeExternalIndex
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeExternalIndex_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeExternalIndex]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeExternalIndex_VectorIndexID ON [${flyway:defaultSchema}].[SearchScopeExternalIndex] ([VectorIndexID]);

/* SQL text to update entity field related entity name field map for entity field ID C7B0E695-7A9D-4D36-A860-CAA0FE743A93 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C7B0E695-7A9D-4D36-A860-CAA0FE743A93', @RelatedEntityNameFieldMap='SearchScope';

/* Index for Foreign Keys for SearchScopePermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopePermission_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopePermission_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopePermission] ([SearchScopeID]);

-- Index for foreign key UserID in table SearchScopePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopePermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopePermission_UserID ON [${flyway:defaultSchema}].[SearchScopePermission] ([UserID]);

-- Index for foreign key RoleID in table SearchScopePermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopePermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopePermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopePermission_RoleID ON [${flyway:defaultSchema}].[SearchScopePermission] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 3F4D48AC-A66F-4ADF-9DFE-9931EDA4B876 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3F4D48AC-A66F-4ADF-9DFE-9931EDA4B876', @RelatedEntityNameFieldMap='SearchScope';

/* Index for Foreign Keys for SearchScopeProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeProvider_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeProvider_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopeProvider] ([SearchScopeID]);

-- Index for foreign key SearchProviderID in table SearchScopeProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeProvider_SearchProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeProvider_SearchProviderID ON [${flyway:defaultSchema}].[SearchScopeProvider] ([SearchProviderID]);

-- Index for foreign key QueryTransformTemplateID in table SearchScopeProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeProvider_QueryTransformTemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeProvider_QueryTransformTemplateID ON [${flyway:defaultSchema}].[SearchScopeProvider] ([QueryTransformTemplateID]);

/* SQL text to update entity field related entity name field map for entity field ID 451A3F52-A5DF-4099-8BC0-E3588C9220AC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='451A3F52-A5DF-4099-8BC0-E3588C9220AC', @RelatedEntityNameFieldMap='SearchScope';

/* SQL text to update entity field related entity name field map for entity field ID 0B6000C0-2ADA-462A-95DB-347997D1B7DD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0B6000C0-2ADA-462A-95DB-347997D1B7DD', @RelatedEntityNameFieldMap='User';

/* SQL text to update entity field related entity name field map for entity field ID 04D1E6AB-0EA1-44F8-932A-56359CEA29B6 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='04D1E6AB-0EA1-44F8-932A-56359CEA29B6', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 95740918-B09C-4EEB-A612-352BEE7B4D1C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='95740918-B09C-4EEB-A612-352BEE7B4D1C', @RelatedEntityNameFieldMap='SearchProvider';

/* SQL text to update entity field related entity name field map for entity field ID CC4C6581-35DE-4B31-9049-4F385E83DAA4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CC4C6581-35DE-4B31-9049-4F385E83DAA4', @RelatedEntityNameFieldMap='VectorIndex';

/* Base View SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: vwSearchScopeExternalIndexes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope External Indexes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopeExternalIndex
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopeExternalIndexes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopeExternalIndexes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopeExternalIndexes]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex]
FROM
    [${flyway:defaultSchema}].[SearchScopeExternalIndex] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [s].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeExternalIndexes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: Permissions for vwSearchScopeExternalIndexes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeExternalIndexes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: spCreateSearchScopeExternalIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeExternalIndex
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopeExternalIndex]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeExternalIndex];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeExternalIndex]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @IndexType nvarchar(40) = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @ExternalIndexName_Clear bit = 0,
    @ExternalIndexName nvarchar(400) = NULL,
    @ExternalIndexConfig_Clear bit = 0,
    @ExternalIndexConfig nvarchar(MAX) = NULL,
    @MetadataFilter_Clear bit = 0,
    @MetadataFilter nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeExternalIndex]
            (
                [ID],
                [SearchScopeID],
                [IndexType],
                [VectorIndexID],
                [ExternalIndexName],
                [ExternalIndexConfig],
                [MetadataFilter]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                ISNULL(@IndexType, 'Vector'),
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @ExternalIndexName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalIndexName, NULL) END,
                CASE WHEN @ExternalIndexConfig_Clear = 1 THEN NULL ELSE ISNULL(@ExternalIndexConfig, NULL) END,
                CASE WHEN @MetadataFilter_Clear = 1 THEN NULL ELSE ISNULL(@MetadataFilter, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeExternalIndex]
            (
                [SearchScopeID],
                [IndexType],
                [VectorIndexID],
                [ExternalIndexName],
                [ExternalIndexConfig],
                [MetadataFilter]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                ISNULL(@IndexType, 'Vector'),
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @ExternalIndexName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalIndexName, NULL) END,
                CASE WHEN @ExternalIndexConfig_Clear = 1 THEN NULL ELSE ISNULL(@ExternalIndexConfig, NULL) END,
                CASE WHEN @MetadataFilter_Clear = 1 THEN NULL ELSE ISNULL(@MetadataFilter, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopeExternalIndexes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeExternalIndex] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Scope External Indexes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeExternalIndex] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: spUpdateSearchScopeExternalIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeExternalIndex
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopeExternalIndex]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeExternalIndex];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeExternalIndex]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier = NULL,
    @IndexType nvarchar(40) = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @ExternalIndexName_Clear bit = 0,
    @ExternalIndexName nvarchar(400) = NULL,
    @ExternalIndexConfig_Clear bit = 0,
    @ExternalIndexConfig nvarchar(MAX) = NULL,
    @MetadataFilter_Clear bit = 0,
    @MetadataFilter nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeExternalIndex]
    SET
        [SearchScopeID] = ISNULL(@SearchScopeID, [SearchScopeID]),
        [IndexType] = ISNULL(@IndexType, [IndexType]),
        [VectorIndexID] = CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, [VectorIndexID]) END,
        [ExternalIndexName] = CASE WHEN @ExternalIndexName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalIndexName, [ExternalIndexName]) END,
        [ExternalIndexConfig] = CASE WHEN @ExternalIndexConfig_Clear = 1 THEN NULL ELSE ISNULL(@ExternalIndexConfig, [ExternalIndexConfig]) END,
        [MetadataFilter] = CASE WHEN @MetadataFilter_Clear = 1 THEN NULL ELSE ISNULL(@MetadataFilter, [MetadataFilter]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopeExternalIndexes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopeExternalIndexes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeExternalIndex] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopeExternalIndex table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopeExternalIndex]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopeExternalIndex];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopeExternalIndex
ON [${flyway:defaultSchema}].[SearchScopeExternalIndex]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeExternalIndex]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopeExternalIndex] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Scope External Indexes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeExternalIndex] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Scope External Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope External Indexes
-- Item: spDeleteSearchScopeExternalIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeExternalIndex
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopeExternalIndex]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeExternalIndex];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeExternalIndex]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopeExternalIndex]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeExternalIndex] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Scope External Indexes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeExternalIndex] TO [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 58E855E8-F804-4A0E-B0AC-722EC76941D8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='58E855E8-F804-4A0E-B0AC-722EC76941D8', @RelatedEntityNameFieldMap='QueryTransformTemplate';

/* Base View SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: vwSearchScopeEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Entities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopeEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopeEntities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopeEntities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopeEntities]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[SearchScopeEntity] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [s].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: Permissions for vwSearchScopeEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: spCreateSearchScopeEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopeEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeEntity]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @EntityID uniqueidentifier,
    @ExtraFilter_Clear bit = 0,
    @ExtraFilter nvarchar(MAX) = NULL,
    @UserSearchString_Clear bit = 0,
    @UserSearchString nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeEntity]
            (
                [ID],
                [SearchScopeID],
                [EntityID],
                [ExtraFilter],
                [UserSearchString]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                @EntityID,
                CASE WHEN @ExtraFilter_Clear = 1 THEN NULL ELSE ISNULL(@ExtraFilter, NULL) END,
                CASE WHEN @UserSearchString_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchString, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeEntity]
            (
                [SearchScopeID],
                [EntityID],
                [ExtraFilter],
                [UserSearchString]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                @EntityID,
                CASE WHEN @ExtraFilter_Clear = 1 THEN NULL ELSE ISNULL(@ExtraFilter, NULL) END,
                CASE WHEN @UserSearchString_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchString, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopeEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeEntity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Scope Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeEntity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: spUpdateSearchScopeEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopeEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeEntity]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @ExtraFilter_Clear bit = 0,
    @ExtraFilter nvarchar(MAX) = NULL,
    @UserSearchString_Clear bit = 0,
    @UserSearchString nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeEntity]
    SET
        [SearchScopeID] = ISNULL(@SearchScopeID, [SearchScopeID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ExtraFilter] = CASE WHEN @ExtraFilter_Clear = 1 THEN NULL ELSE ISNULL(@ExtraFilter, [ExtraFilter]) END,
        [UserSearchString] = CASE WHEN @UserSearchString_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchString, [UserSearchString]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopeEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopeEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopeEntity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopeEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopeEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopeEntity
ON [${flyway:defaultSchema}].[SearchScopeEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopeEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Scope Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Scope Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Entities
-- Item: spDeleteSearchScopeEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopeEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopeEntity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeEntity] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Scope Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeEntity] TO [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 806A6BEF-8E3A-4957-B122-DD08B62727D2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='806A6BEF-8E3A-4957-B122-DD08B62727D2', @RelatedEntityNameFieldMap='Role';

/* Base View SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: vwSearchScopeProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopeProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopeProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopeProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopeProviders]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJSearchProvider_SearchProviderID.[Name] AS [SearchProvider],
    MJTemplate_QueryTransformTemplateID.[Name] AS [QueryTransformTemplate]
FROM
    [${flyway:defaultSchema}].[SearchScopeProvider] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SearchProvider] AS MJSearchProvider_SearchProviderID
  ON
    [s].[SearchProviderID] = MJSearchProvider_SearchProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Template] AS MJTemplate_QueryTransformTemplateID
  ON
    [s].[QueryTransformTemplateID] = MJTemplate_QueryTransformTemplateID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: Permissions for vwSearchScopeProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: spCreateSearchScopeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopeProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeProvider]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @SearchProviderID uniqueidentifier,
    @Enabled bit = NULL,
    @MaxResultsOverride_Clear bit = 0,
    @MaxResultsOverride int = NULL,
    @ProviderConfigOverride_Clear bit = 0,
    @ProviderConfigOverride nvarchar(MAX) = NULL,
    @QueryTransformTemplateID_Clear bit = 0,
    @QueryTransformTemplateID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeProvider]
            (
                [ID],
                [SearchScopeID],
                [SearchProviderID],
                [Enabled],
                [MaxResultsOverride],
                [ProviderConfigOverride],
                [QueryTransformTemplateID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                @SearchProviderID,
                ISNULL(@Enabled, 1),
                CASE WHEN @MaxResultsOverride_Clear = 1 THEN NULL ELSE ISNULL(@MaxResultsOverride, NULL) END,
                CASE WHEN @ProviderConfigOverride_Clear = 1 THEN NULL ELSE ISNULL(@ProviderConfigOverride, NULL) END,
                CASE WHEN @QueryTransformTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@QueryTransformTemplateID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeProvider]
            (
                [SearchScopeID],
                [SearchProviderID],
                [Enabled],
                [MaxResultsOverride],
                [ProviderConfigOverride],
                [QueryTransformTemplateID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                @SearchProviderID,
                ISNULL(@Enabled, 1),
                CASE WHEN @MaxResultsOverride_Clear = 1 THEN NULL ELSE ISNULL(@MaxResultsOverride, NULL) END,
                CASE WHEN @ProviderConfigOverride_Clear = 1 THEN NULL ELSE ISNULL(@ProviderConfigOverride, NULL) END,
                CASE WHEN @QueryTransformTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@QueryTransformTemplateID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopeProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeProvider] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Scope Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeProvider] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: spUpdateSearchScopeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopeProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeProvider]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier = NULL,
    @SearchProviderID uniqueidentifier = NULL,
    @Enabled bit = NULL,
    @MaxResultsOverride_Clear bit = 0,
    @MaxResultsOverride int = NULL,
    @ProviderConfigOverride_Clear bit = 0,
    @ProviderConfigOverride nvarchar(MAX) = NULL,
    @QueryTransformTemplateID_Clear bit = 0,
    @QueryTransformTemplateID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeProvider]
    SET
        [SearchScopeID] = ISNULL(@SearchScopeID, [SearchScopeID]),
        [SearchProviderID] = ISNULL(@SearchProviderID, [SearchProviderID]),
        [Enabled] = ISNULL(@Enabled, [Enabled]),
        [MaxResultsOverride] = CASE WHEN @MaxResultsOverride_Clear = 1 THEN NULL ELSE ISNULL(@MaxResultsOverride, [MaxResultsOverride]) END,
        [ProviderConfigOverride] = CASE WHEN @ProviderConfigOverride_Clear = 1 THEN NULL ELSE ISNULL(@ProviderConfigOverride, [ProviderConfigOverride]) END,
        [QueryTransformTemplateID] = CASE WHEN @QueryTransformTemplateID_Clear = 1 THEN NULL ELSE ISNULL(@QueryTransformTemplateID, [QueryTransformTemplateID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopeProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopeProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeProvider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopeProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopeProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopeProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopeProvider
ON [${flyway:defaultSchema}].[SearchScopeProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopeProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Scope Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Scope Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Providers
-- Item: spDeleteSearchScopeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopeProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopeProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeProvider] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Scope Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeProvider] TO [cdp_Integration];

/* Base View SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: vwSearchScopePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopePermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopePermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopePermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopePermissions]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[SearchScopePermission] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [s].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [s].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopePermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: Permissions for vwSearchScopePermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopePermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spCreateSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopePermission]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @PermissionLevel nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopePermission]
            (
                [ID],
                [SearchScopeID],
                [UserID],
                [RoleID],
                [PermissionLevel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                @PermissionLevel
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopePermission]
            (
                [SearchScopeID],
                [UserID],
                [RoleID],
                [PermissionLevel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, NULL) END,
                @PermissionLevel
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopePermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopePermission] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Scope Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopePermission] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spUpdateSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopePermission]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @RoleID_Clear bit = 0,
    @RoleID uniqueidentifier = NULL,
    @PermissionLevel nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopePermission]
    SET
        [SearchScopeID] = ISNULL(@SearchScopeID, [SearchScopeID]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [RoleID] = CASE WHEN @RoleID_Clear = 1 THEN NULL ELSE ISNULL(@RoleID, [RoleID]) END,
        [PermissionLevel] = ISNULL(@PermissionLevel, [PermissionLevel])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopePermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopePermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopePermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopePermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopePermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopePermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopePermission
ON [${flyway:defaultSchema}].[SearchScopePermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopePermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopePermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Scope Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopePermission] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Scope Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Permissions
-- Item: spDeleteSearchScopePermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopePermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopePermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopePermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopePermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopePermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopePermission] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Scope Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopePermission] TO [cdp_Integration];

/* Index for Foreign Keys for SearchScopeStorageAccount */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeStorageAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeStorageAccount_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeStorageAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeStorageAccount_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopeStorageAccount] ([SearchScopeID]);

-- Index for foreign key FileStorageAccountID in table SearchScopeStorageAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeStorageAccount_FileStorageAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeStorageAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeStorageAccount_FileStorageAccountID ON [${flyway:defaultSchema}].[SearchScopeStorageAccount] ([FileStorageAccountID]);

/* SQL text to update entity field related entity name field map for entity field ID 32221C7E-325D-4AFB-B7A5-3B0F5F52834D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='32221C7E-325D-4AFB-B7A5-3B0F5F52834D', @RelatedEntityNameFieldMap='SearchScope';

/* Index for Foreign Keys for SearchScopeTestQuery */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SearchScopeID in table SearchScopeTestQuery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScopeTestQuery_SearchScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScopeTestQuery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScopeTestQuery_SearchScopeID ON [${flyway:defaultSchema}].[SearchScopeTestQuery] ([SearchScopeID]);

/* SQL text to update entity field related entity name field map for entity field ID CFE7D72F-79D3-4AA9-8469-207C2151C14B */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CFE7D72F-79D3-4AA9-8469-207C2151C14B', @RelatedEntityNameFieldMap='SearchScope';

/* Index for Foreign Keys for SearchScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OwnerUserID in table SearchScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchScope_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchScope_OwnerUserID ON [${flyway:defaultSchema}].[SearchScope] ([OwnerUserID]);

/* SQL text to update entity field related entity name field map for entity field ID A515DCD2-C9CD-471F-A6F2-2DB35D3C5C03 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A515DCD2-C9CD-471F-A6F2-2DB35D3C5C03', @RelatedEntityNameFieldMap='OwnerUser';

/* Base View SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: vwSearchScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopes]
AS
SELECT
    s.*,
    MJUser_OwnerUserID.[Name] AS [OwnerUser]
FROM
    [${flyway:defaultSchema}].[SearchScope] AS s
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerUserID
  ON
    [s].[OwnerUserID] = MJUser_OwnerUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: Permissions for vwSearchScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: spCreateSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScope]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(200) = NULL,
    @IsGlobal bit = NULL,
    @IsDefault bit = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @ScopeConfig_Clear bit = 0,
    @ScopeConfig nvarchar(MAX) = NULL,
    @SearchContextConfig_Clear bit = 0,
    @SearchContextConfig nvarchar(MAX) = NULL,
    @RerankerBudgetCents_Clear bit = 0,
    @RerankerBudgetCents int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScope]
            (
                [ID],
                [Name],
                [Description],
                [Icon],
                [IsGlobal],
                [IsDefault],
                [OwnerUserID],
                [Status],
                [StartAt],
                [EndAt],
                [ScopeConfig],
                [SearchContextConfig],
                [RerankerBudgetCents]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@IsGlobal, 0),
                ISNULL(@IsDefault, 0),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, NULL) END,
                CASE WHEN @SearchContextConfig_Clear = 1 THEN NULL ELSE ISNULL(@SearchContextConfig, NULL) END,
                CASE WHEN @RerankerBudgetCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerBudgetCents, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScope]
            (
                [Name],
                [Description],
                [Icon],
                [IsGlobal],
                [IsDefault],
                [OwnerUserID],
                [Status],
                [StartAt],
                [EndAt],
                [ScopeConfig],
                [SearchContextConfig],
                [RerankerBudgetCents]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@IsGlobal, 0),
                ISNULL(@IsDefault, 0),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, NULL) END,
                CASE WHEN @SearchContextConfig_Clear = 1 THEN NULL ELSE ISNULL(@SearchContextConfig, NULL) END,
                CASE WHEN @RerankerBudgetCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerBudgetCents, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScope] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScope] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: spUpdateSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScope]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(200) = NULL,
    @IsGlobal bit = NULL,
    @IsDefault bit = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @ScopeConfig_Clear bit = 0,
    @ScopeConfig nvarchar(MAX) = NULL,
    @SearchContextConfig_Clear bit = 0,
    @SearchContextConfig nvarchar(MAX) = NULL,
    @RerankerBudgetCents_Clear bit = 0,
    @RerankerBudgetCents int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScope]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [IsGlobal] = ISNULL(@IsGlobal, [IsGlobal]),
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [OwnerUserID] = CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, [OwnerUserID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartAt] = CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, [StartAt]) END,
        [EndAt] = CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, [EndAt]) END,
        [ScopeConfig] = CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, [ScopeConfig]) END,
        [SearchContextConfig] = CASE WHEN @SearchContextConfig_Clear = 1 THEN NULL ELSE ISNULL(@SearchContextConfig, [SearchContextConfig]) END,
        [RerankerBudgetCents] = CASE WHEN @RerankerBudgetCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerBudgetCents, [RerankerBudgetCents]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScope
ON [${flyway:defaultSchema}].[SearchScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScope] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scopes
-- Item: spDeleteSearchScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScope] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScope] TO [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID BD032D1E-1B51-48BA-ACE1-AEF987C7F7AB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BD032D1E-1B51-48BA-ACE1-AEF987C7F7AB', @RelatedEntityNameFieldMap='FileStorageAccount';

/* Base View SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: vwSearchScopeTestQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Test Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopeTestQuery
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopeTestQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopeTestQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopeTestQueries]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope]
FROM
    [${flyway:defaultSchema}].[SearchScopeTestQuery] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeTestQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: Permissions for vwSearchScopeTestQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeTestQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spCreateSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopeTestQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @Label nvarchar(200),
    @Query nvarchar(MAX),
    @ExpectedTopResultEntity_Clear bit = 0,
    @ExpectedTopResultEntity nvarchar(255) = NULL,
    @ExpectedTopResultRecordID_Clear bit = 0,
    @ExpectedTopResultRecordID uniqueidentifier = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeTestQuery]
            (
                [ID],
                [SearchScopeID],
                [Label],
                [Query],
                [ExpectedTopResultEntity],
                [ExpectedTopResultRecordID],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                @Label,
                @Query,
                CASE WHEN @ExpectedTopResultEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedTopResultEntity, NULL) END,
                CASE WHEN @ExpectedTopResultRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedTopResultRecordID, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeTestQuery]
            (
                [SearchScopeID],
                [Label],
                [Query],
                [ExpectedTopResultEntity],
                [ExpectedTopResultRecordID],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                @Label,
                @Query,
                CASE WHEN @ExpectedTopResultEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedTopResultEntity, NULL) END,
                CASE WHEN @ExpectedTopResultRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedTopResultRecordID, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopeTestQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Scope Test Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spUpdateSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier = NULL,
    @Label nvarchar(200) = NULL,
    @Query nvarchar(MAX) = NULL,
    @ExpectedTopResultEntity_Clear bit = 0,
    @ExpectedTopResultEntity nvarchar(255) = NULL,
    @ExpectedTopResultRecordID_Clear bit = 0,
    @ExpectedTopResultRecordID uniqueidentifier = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeTestQuery]
    SET
        [SearchScopeID] = ISNULL(@SearchScopeID, [SearchScopeID]),
        [Label] = ISNULL(@Label, [Label]),
        [Query] = ISNULL(@Query, [Query]),
        [ExpectedTopResultEntity] = CASE WHEN @ExpectedTopResultEntity_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedTopResultEntity, [ExpectedTopResultEntity]) END,
        [ExpectedTopResultRecordID] = CASE WHEN @ExpectedTopResultRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedTopResultRecordID, [ExpectedTopResultRecordID]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopeTestQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopeTestQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopeTestQuery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopeTestQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopeTestQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopeTestQuery
ON [${flyway:defaultSchema}].[SearchScopeTestQuery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeTestQuery]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopeTestQuery] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Scope Test Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeTestQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Scope Test Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Test Queries
-- Item: spDeleteSearchScopeTestQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeTestQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopeTestQuery]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Scope Test Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeTestQuery] TO [cdp_Integration];

/* Base View SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: vwSearchScopeStorageAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Scope Storage Accounts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchScopeStorageAccount
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchScopeStorageAccounts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchScopeStorageAccounts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchScopeStorageAccounts]
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID.[Name] AS [SearchScope],
    MJFileStorageAccount_FileStorageAccountID.[Name] AS [FileStorageAccount]
FROM
    [${flyway:defaultSchema}].[SearchScopeStorageAccount] AS s
INNER JOIN
    [${flyway:defaultSchema}].[SearchScope] AS MJSearchScope_SearchScopeID
  ON
    [s].[SearchScopeID] = MJSearchScope_SearchScopeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_FileStorageAccountID
  ON
    [s].[FileStorageAccountID] = MJFileStorageAccount_FileStorageAccountID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeStorageAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: Permissions for vwSearchScopeStorageAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchScopeStorageAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: spCreateSearchScopeStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchScopeStorageAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchScopeStorageAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeStorageAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchScopeStorageAccount]
    @ID uniqueidentifier = NULL,
    @SearchScopeID uniqueidentifier,
    @FileStorageAccountID uniqueidentifier,
    @FolderPath_Clear bit = 0,
    @FolderPath nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeStorageAccount]
            (
                [ID],
                [SearchScopeID],
                [FileStorageAccountID],
                [FolderPath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SearchScopeID,
                @FileStorageAccountID,
                CASE WHEN @FolderPath_Clear = 1 THEN NULL ELSE ISNULL(@FolderPath, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchScopeStorageAccount]
            (
                [SearchScopeID],
                [FileStorageAccountID],
                [FolderPath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SearchScopeID,
                @FileStorageAccountID,
                CASE WHEN @FolderPath_Clear = 1 THEN NULL ELSE ISNULL(@FolderPath, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchScopeStorageAccounts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeStorageAccount] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Scope Storage Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchScopeStorageAccount] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: spUpdateSearchScopeStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchScopeStorageAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchScopeStorageAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeStorageAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchScopeStorageAccount]
    @ID uniqueidentifier,
    @SearchScopeID uniqueidentifier = NULL,
    @FileStorageAccountID uniqueidentifier = NULL,
    @FolderPath_Clear bit = 0,
    @FolderPath nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeStorageAccount]
    SET
        [SearchScopeID] = ISNULL(@SearchScopeID, [SearchScopeID]),
        [FileStorageAccountID] = ISNULL(@FileStorageAccountID, [FileStorageAccountID]),
        [FolderPath] = CASE WHEN @FolderPath_Clear = 1 THEN NULL ELSE ISNULL(@FolderPath, [FolderPath]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchScopeStorageAccounts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchScopeStorageAccounts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeStorageAccount] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchScopeStorageAccount table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchScopeStorageAccount]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchScopeStorageAccount];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchScopeStorageAccount
ON [${flyway:defaultSchema}].[SearchScopeStorageAccount]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchScopeStorageAccount]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchScopeStorageAccount] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Scope Storage Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchScopeStorageAccount] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Search Scope Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Scope Storage Accounts
-- Item: spDeleteSearchScopeStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchScopeStorageAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchScopeStorageAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeStorageAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchScopeStorageAccount]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchScopeStorageAccount]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeStorageAccount] TO [cdp_Integration];

/* spDelete Permissions for MJ: Search Scope Storage Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchScopeStorageAccount] TO [cdp_Integration];

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

-- Index for foreign key TypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_TypeID ON [${flyway:defaultSchema}].[AIAgent] ([TypeID]);

-- Index for foreign key DefaultArtifactTypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultArtifactTypeID]);

-- Index for foreign key OwnerUserID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID ON [${flyway:defaultSchema}].[AIAgent] ([OwnerUserID]);

-- Index for foreign key AttachmentStorageProviderID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID ON [${flyway:defaultSchema}].[AIAgent] ([AttachmentStorageProviderID]);

-- Index for foreign key CategoryID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_CategoryID ON [${flyway:defaultSchema}].[AIAgent] ([CategoryID]);

-- Index for foreign key DefaultStorageAccountID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultStorageAccountID]);

/* Root ID Function SQL for MJ: AI Agents.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: fnAIAgentParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgent].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]
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
            [${flyway:defaultSchema}].[AIAgent]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent] c
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

/* Base View SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    MJAIAgent_ParentID.[Name] AS [Parent],
    MJAIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    MJAIAgentType_TypeID.[Name] AS [Type],
    MJArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType],
    MJUser_OwnerUserID.[Name] AS [OwnerUser],
    MJFileStorageProvider_AttachmentStorageProviderID.[Name] AS [AttachmentStorageProvider],
    MJAIAgentCategory_CategoryID.[Name] AS [Category],
    MJFileStorageAccount_DefaultStorageAccountID.[Name] AS [DefaultStorageAccount],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_ParentID
  ON
    [a].[ParentID] = MJAIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = MJAIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS MJAIAgentType_TypeID
  ON
    [a].[TypeID] = MJAIAgentType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS MJArtifactType_DefaultArtifactTypeID
  ON
    [a].[DefaultArtifactTypeID] = MJArtifactType_DefaultArtifactTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerUserID
  ON
    [a].[OwnerUserID] = MJUser_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    [a].[AttachmentStorageProviderID] = MJFileStorageProvider_AttachmentStorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentCategory] AS MJAIAgentCategory_CategoryID
  ON
    [a].[CategoryID] = MJAIAgentCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    [a].[DefaultStorageAccountID] = MJFileStorageAccount_DefaultStorageAccountID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @LogoURL_Clear bit = 0,
    @LogoURL nvarchar(255) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold_Clear bit = 0,
    @ContextCompressionMessageThreshold int = NULL,
    @ContextCompressionPromptID_Clear bit = 0,
    @ContextCompressionPromptID uniqueidentifier = NULL,
    @ContextCompressionMessageRetentionCount_Clear bit = 0,
    @ContextCompressionMessageRetentionCount int = NULL,
    @TypeID_Clear bit = 0,
    @TypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths_Clear bit = 0,
    @PayloadSelfReadPaths nvarchar(MAX) = NULL,
    @PayloadSelfWritePaths_Clear bit = 0,
    @PayloadSelfWritePaths nvarchar(MAX) = NULL,
    @PayloadScope_Clear bit = 0,
    @PayloadScope nvarchar(MAX) = NULL,
    @FinalPayloadValidation_Clear bit = 0,
    @FinalPayloadValidation nvarchar(MAX) = NULL,
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun_Clear bit = 0,
    @MaxCostPerRun decimal(10, 4) = NULL,
    @MaxTokensPerRun_Clear bit = 0,
    @MaxTokensPerRun int = NULL,
    @MaxIterationsPerRun_Clear bit = 0,
    @MaxIterationsPerRun int = NULL,
    @MaxTimePerRun_Clear bit = 0,
    @MaxTimePerRun int = NULL,
    @MinExecutionsPerRun_Clear bit = 0,
    @MinExecutionsPerRun int = NULL,
    @MaxExecutionsPerRun_Clear bit = 0,
    @MaxExecutionsPerRun int = NULL,
    @StartingPayloadValidation_Clear bit = 0,
    @StartingPayloadValidation nvarchar(MAX) = NULL,
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel_Clear bit = 0,
    @DefaultPromptEffortLevel int = NULL,
    @ChatHandlingOption_Clear bit = 0,
    @ChatHandlingOption nvarchar(30) = NULL,
    @DefaultArtifactTypeID_Clear bit = 0,
    @DefaultArtifactTypeID uniqueidentifier = NULL,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements_Clear bit = 0,
    @FunctionalRequirements nvarchar(MAX) = NULL,
    @TechnicalDesign_Clear bit = 0,
    @TechnicalDesign nvarchar(MAX) = NULL,
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages_Clear bit = 0,
    @MaxMessages int = NULL,
    @AttachmentStorageProviderID_Clear bit = 0,
    @AttachmentStorageProviderID uniqueidentifier = NULL,
    @AttachmentRootPath_Clear bit = 0,
    @AttachmentRootPath nvarchar(500) = NULL,
    @InlineStorageThresholdBytes_Clear bit = 0,
    @InlineStorageThresholdBytes int = NULL,
    @AgentTypePromptParams_Clear bit = 0,
    @AgentTypePromptParams nvarchar(MAX) = NULL,
    @ScopeConfig_Clear bit = 0,
    @ScopeConfig nvarchar(MAX) = NULL,
    @NoteRetentionDays_Clear bit = 0,
    @NoteRetentionDays int = NULL,
    @ExampleRetentionDays_Clear bit = 0,
    @ExampleRetentionDays int = NULL,
    @AutoArchiveEnabled bit = NULL,
    @RerankerConfiguration_Clear bit = 0,
    @RerankerConfiguration nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @AllowEphemeralClientTools bit = NULL,
    @DefaultStorageAccountID_Clear bit = 0,
    @DefaultStorageAccountID uniqueidentifier = NULL,
    @SearchScopeAccess nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [ID],
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration],
                [CategoryID],
                [AllowEphemeralClientTools],
                [DefaultStorageAccountID],
                [SearchScopeAccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                CASE WHEN @ContextCompressionMessageThreshold_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN @ContextCompressionPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionPromptID, NULL) END,
                CASE WHEN @ContextCompressionMessageRetentionCount_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN @TypeID_Clear = 1 THEN NULL ELSE ISNULL(@TypeID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                CASE WHEN @PayloadSelfReadPaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfReadPaths, NULL) END,
                CASE WHEN @PayloadSelfWritePaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfWritePaths, NULL) END,
                CASE WHEN @PayloadScope_Clear = 1 THEN NULL ELSE ISNULL(@PayloadScope, NULL) END,
                CASE WHEN @FinalPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidation, NULL) END,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                CASE WHEN @MaxCostPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxCostPerRun, NULL) END,
                CASE WHEN @MaxTokensPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTokensPerRun, NULL) END,
                CASE WHEN @MaxIterationsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxIterationsPerRun, NULL) END,
                CASE WHEN @MaxTimePerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTimePerRun, NULL) END,
                CASE WHEN @MinExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MinExecutionsPerRun, NULL) END,
                CASE WHEN @MaxExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxExecutionsPerRun, NULL) END,
                CASE WHEN @StartingPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayloadValidation, NULL) END,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                CASE WHEN @DefaultPromptEffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPromptEffortLevel, NULL) END,
                CASE WHEN @ChatHandlingOption_Clear = 1 THEN NULL ELSE ISNULL(@ChatHandlingOption, NULL) END,
                CASE WHEN @DefaultArtifactTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultArtifactTypeID, NULL) END,
                CASE WHEN @OwnerUserID = '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, NULL) END,
                CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, NULL) END,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                CASE WHEN @MaxMessages_Clear = 1 THEN NULL ELSE ISNULL(@MaxMessages, NULL) END,
                CASE WHEN @AttachmentStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentStorageProviderID, NULL) END,
                CASE WHEN @AttachmentRootPath_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentRootPath, NULL) END,
                CASE WHEN @InlineStorageThresholdBytes_Clear = 1 THEN NULL ELSE ISNULL(@InlineStorageThresholdBytes, NULL) END,
                CASE WHEN @AgentTypePromptParams_Clear = 1 THEN NULL ELSE ISNULL(@AgentTypePromptParams, NULL) END,
                CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, NULL) END,
                CASE WHEN @NoteRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@NoteRetentionDays, 90) END,
                CASE WHEN @ExampleRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@ExampleRetentionDays, 180) END,
                ISNULL(@AutoArchiveEnabled, 1),
                CASE WHEN @RerankerConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@RerankerConfiguration, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                ISNULL(@AllowEphemeralClientTools, 1),
                CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, NULL) END,
                ISNULL(@SearchScopeAccess, 'None')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration],
                [CategoryID],
                [AllowEphemeralClientTools],
                [DefaultStorageAccountID],
                [SearchScopeAccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                CASE WHEN @ContextCompressionMessageThreshold_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN @ContextCompressionPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionPromptID, NULL) END,
                CASE WHEN @ContextCompressionMessageRetentionCount_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN @TypeID_Clear = 1 THEN NULL ELSE ISNULL(@TypeID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                CASE WHEN @PayloadSelfReadPaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfReadPaths, NULL) END,
                CASE WHEN @PayloadSelfWritePaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfWritePaths, NULL) END,
                CASE WHEN @PayloadScope_Clear = 1 THEN NULL ELSE ISNULL(@PayloadScope, NULL) END,
                CASE WHEN @FinalPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidation, NULL) END,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                CASE WHEN @MaxCostPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxCostPerRun, NULL) END,
                CASE WHEN @MaxTokensPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTokensPerRun, NULL) END,
                CASE WHEN @MaxIterationsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxIterationsPerRun, NULL) END,
                CASE WHEN @MaxTimePerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTimePerRun, NULL) END,
                CASE WHEN @MinExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MinExecutionsPerRun, NULL) END,
                CASE WHEN @MaxExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxExecutionsPerRun, NULL) END,
                CASE WHEN @StartingPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayloadValidation, NULL) END,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                CASE WHEN @DefaultPromptEffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPromptEffortLevel, NULL) END,
                CASE WHEN @ChatHandlingOption_Clear = 1 THEN NULL ELSE ISNULL(@ChatHandlingOption, NULL) END,
                CASE WHEN @DefaultArtifactTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultArtifactTypeID, NULL) END,
                CASE WHEN @OwnerUserID = '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, NULL) END,
                CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, NULL) END,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                CASE WHEN @MaxMessages_Clear = 1 THEN NULL ELSE ISNULL(@MaxMessages, NULL) END,
                CASE WHEN @AttachmentStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentStorageProviderID, NULL) END,
                CASE WHEN @AttachmentRootPath_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentRootPath, NULL) END,
                CASE WHEN @InlineStorageThresholdBytes_Clear = 1 THEN NULL ELSE ISNULL(@InlineStorageThresholdBytes, NULL) END,
                CASE WHEN @AgentTypePromptParams_Clear = 1 THEN NULL ELSE ISNULL(@AgentTypePromptParams, NULL) END,
                CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, NULL) END,
                CASE WHEN @NoteRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@NoteRetentionDays, 90) END,
                CASE WHEN @ExampleRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@ExampleRetentionDays, 180) END,
                ISNULL(@AutoArchiveEnabled, 1),
                CASE WHEN @RerankerConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@RerankerConfiguration, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                ISNULL(@AllowEphemeralClientTools, 1),
                CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, NULL) END,
                ISNULL(@SearchScopeAccess, 'None')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @LogoURL_Clear bit = 0,
    @LogoURL nvarchar(255) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold_Clear bit = 0,
    @ContextCompressionMessageThreshold int = NULL,
    @ContextCompressionPromptID_Clear bit = 0,
    @ContextCompressionPromptID uniqueidentifier = NULL,
    @ContextCompressionMessageRetentionCount_Clear bit = 0,
    @ContextCompressionMessageRetentionCount int = NULL,
    @TypeID_Clear bit = 0,
    @TypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths_Clear bit = 0,
    @PayloadSelfReadPaths nvarchar(MAX) = NULL,
    @PayloadSelfWritePaths_Clear bit = 0,
    @PayloadSelfWritePaths nvarchar(MAX) = NULL,
    @PayloadScope_Clear bit = 0,
    @PayloadScope nvarchar(MAX) = NULL,
    @FinalPayloadValidation_Clear bit = 0,
    @FinalPayloadValidation nvarchar(MAX) = NULL,
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun_Clear bit = 0,
    @MaxCostPerRun decimal(10, 4) = NULL,
    @MaxTokensPerRun_Clear bit = 0,
    @MaxTokensPerRun int = NULL,
    @MaxIterationsPerRun_Clear bit = 0,
    @MaxIterationsPerRun int = NULL,
    @MaxTimePerRun_Clear bit = 0,
    @MaxTimePerRun int = NULL,
    @MinExecutionsPerRun_Clear bit = 0,
    @MinExecutionsPerRun int = NULL,
    @MaxExecutionsPerRun_Clear bit = 0,
    @MaxExecutionsPerRun int = NULL,
    @StartingPayloadValidation_Clear bit = 0,
    @StartingPayloadValidation nvarchar(MAX) = NULL,
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel_Clear bit = 0,
    @DefaultPromptEffortLevel int = NULL,
    @ChatHandlingOption_Clear bit = 0,
    @ChatHandlingOption nvarchar(30) = NULL,
    @DefaultArtifactTypeID_Clear bit = 0,
    @DefaultArtifactTypeID uniqueidentifier = NULL,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements_Clear bit = 0,
    @FunctionalRequirements nvarchar(MAX) = NULL,
    @TechnicalDesign_Clear bit = 0,
    @TechnicalDesign nvarchar(MAX) = NULL,
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages_Clear bit = 0,
    @MaxMessages int = NULL,
    @AttachmentStorageProviderID_Clear bit = 0,
    @AttachmentStorageProviderID uniqueidentifier = NULL,
    @AttachmentRootPath_Clear bit = 0,
    @AttachmentRootPath nvarchar(500) = NULL,
    @InlineStorageThresholdBytes_Clear bit = 0,
    @InlineStorageThresholdBytes int = NULL,
    @AgentTypePromptParams_Clear bit = 0,
    @AgentTypePromptParams nvarchar(MAX) = NULL,
    @ScopeConfig_Clear bit = 0,
    @ScopeConfig nvarchar(MAX) = NULL,
    @NoteRetentionDays_Clear bit = 0,
    @NoteRetentionDays int = NULL,
    @ExampleRetentionDays_Clear bit = 0,
    @ExampleRetentionDays int = NULL,
    @AutoArchiveEnabled bit = NULL,
    @RerankerConfiguration_Clear bit = 0,
    @RerankerConfiguration nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @AllowEphemeralClientTools bit = NULL,
    @DefaultStorageAccountID_Clear bit = 0,
    @DefaultStorageAccountID uniqueidentifier = NULL,
    @SearchScopeAccess nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [LogoURL] = CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, [LogoURL]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [ExposeAsAction] = ISNULL(@ExposeAsAction, [ExposeAsAction]),
        [ExecutionOrder] = ISNULL(@ExecutionOrder, [ExecutionOrder]),
        [ExecutionMode] = ISNULL(@ExecutionMode, [ExecutionMode]),
        [EnableContextCompression] = ISNULL(@EnableContextCompression, [EnableContextCompression]),
        [ContextCompressionMessageThreshold] = CASE WHEN @ContextCompressionMessageThreshold_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageThreshold, [ContextCompressionMessageThreshold]) END,
        [ContextCompressionPromptID] = CASE WHEN @ContextCompressionPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionPromptID, [ContextCompressionPromptID]) END,
        [ContextCompressionMessageRetentionCount] = CASE WHEN @ContextCompressionMessageRetentionCount_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageRetentionCount, [ContextCompressionMessageRetentionCount]) END,
        [TypeID] = CASE WHEN @TypeID_Clear = 1 THEN NULL ELSE ISNULL(@TypeID, [TypeID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [ModelSelectionMode] = ISNULL(@ModelSelectionMode, [ModelSelectionMode]),
        [PayloadDownstreamPaths] = ISNULL(@PayloadDownstreamPaths, [PayloadDownstreamPaths]),
        [PayloadUpstreamPaths] = ISNULL(@PayloadUpstreamPaths, [PayloadUpstreamPaths]),
        [PayloadSelfReadPaths] = CASE WHEN @PayloadSelfReadPaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfReadPaths, [PayloadSelfReadPaths]) END,
        [PayloadSelfWritePaths] = CASE WHEN @PayloadSelfWritePaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfWritePaths, [PayloadSelfWritePaths]) END,
        [PayloadScope] = CASE WHEN @PayloadScope_Clear = 1 THEN NULL ELSE ISNULL(@PayloadScope, [PayloadScope]) END,
        [FinalPayloadValidation] = CASE WHEN @FinalPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidation, [FinalPayloadValidation]) END,
        [FinalPayloadValidationMode] = ISNULL(@FinalPayloadValidationMode, [FinalPayloadValidationMode]),
        [FinalPayloadValidationMaxRetries] = ISNULL(@FinalPayloadValidationMaxRetries, [FinalPayloadValidationMaxRetries]),
        [MaxCostPerRun] = CASE WHEN @MaxCostPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxCostPerRun, [MaxCostPerRun]) END,
        [MaxTokensPerRun] = CASE WHEN @MaxTokensPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTokensPerRun, [MaxTokensPerRun]) END,
        [MaxIterationsPerRun] = CASE WHEN @MaxIterationsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxIterationsPerRun, [MaxIterationsPerRun]) END,
        [MaxTimePerRun] = CASE WHEN @MaxTimePerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTimePerRun, [MaxTimePerRun]) END,
        [MinExecutionsPerRun] = CASE WHEN @MinExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MinExecutionsPerRun, [MinExecutionsPerRun]) END,
        [MaxExecutionsPerRun] = CASE WHEN @MaxExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxExecutionsPerRun, [MaxExecutionsPerRun]) END,
        [StartingPayloadValidation] = CASE WHEN @StartingPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayloadValidation, [StartingPayloadValidation]) END,
        [StartingPayloadValidationMode] = ISNULL(@StartingPayloadValidationMode, [StartingPayloadValidationMode]),
        [DefaultPromptEffortLevel] = CASE WHEN @DefaultPromptEffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPromptEffortLevel, [DefaultPromptEffortLevel]) END,
        [ChatHandlingOption] = CASE WHEN @ChatHandlingOption_Clear = 1 THEN NULL ELSE ISNULL(@ChatHandlingOption, [ChatHandlingOption]) END,
        [DefaultArtifactTypeID] = CASE WHEN @DefaultArtifactTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultArtifactTypeID, [DefaultArtifactTypeID]) END,
        [OwnerUserID] = ISNULL(@OwnerUserID, [OwnerUserID]),
        [InvocationMode] = ISNULL(@InvocationMode, [InvocationMode]),
        [ArtifactCreationMode] = ISNULL(@ArtifactCreationMode, [ArtifactCreationMode]),
        [FunctionalRequirements] = CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, [FunctionalRequirements]) END,
        [TechnicalDesign] = CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, [TechnicalDesign]) END,
        [InjectNotes] = ISNULL(@InjectNotes, [InjectNotes]),
        [MaxNotesToInject] = ISNULL(@MaxNotesToInject, [MaxNotesToInject]),
        [NoteInjectionStrategy] = ISNULL(@NoteInjectionStrategy, [NoteInjectionStrategy]),
        [InjectExamples] = ISNULL(@InjectExamples, [InjectExamples]),
        [MaxExamplesToInject] = ISNULL(@MaxExamplesToInject, [MaxExamplesToInject]),
        [ExampleInjectionStrategy] = ISNULL(@ExampleInjectionStrategy, [ExampleInjectionStrategy]),
        [IsRestricted] = ISNULL(@IsRestricted, [IsRestricted]),
        [MessageMode] = ISNULL(@MessageMode, [MessageMode]),
        [MaxMessages] = CASE WHEN @MaxMessages_Clear = 1 THEN NULL ELSE ISNULL(@MaxMessages, [MaxMessages]) END,
        [AttachmentStorageProviderID] = CASE WHEN @AttachmentStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentStorageProviderID, [AttachmentStorageProviderID]) END,
        [AttachmentRootPath] = CASE WHEN @AttachmentRootPath_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentRootPath, [AttachmentRootPath]) END,
        [InlineStorageThresholdBytes] = CASE WHEN @InlineStorageThresholdBytes_Clear = 1 THEN NULL ELSE ISNULL(@InlineStorageThresholdBytes, [InlineStorageThresholdBytes]) END,
        [AgentTypePromptParams] = CASE WHEN @AgentTypePromptParams_Clear = 1 THEN NULL ELSE ISNULL(@AgentTypePromptParams, [AgentTypePromptParams]) END,
        [ScopeConfig] = CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, [ScopeConfig]) END,
        [NoteRetentionDays] = CASE WHEN @NoteRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@NoteRetentionDays, [NoteRetentionDays]) END,
        [ExampleRetentionDays] = CASE WHEN @ExampleRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@ExampleRetentionDays, [ExampleRetentionDays]) END,
        [AutoArchiveEnabled] = ISNULL(@AutoArchiveEnabled, [AutoArchiveEnabled]),
        [RerankerConfiguration] = CASE WHEN @RerankerConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@RerankerConfiguration, [RerankerConfiguration]) END,
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [AllowEphemeralClientTools] = ISNULL(@AllowEphemeralClientTools, [AllowEphemeralClientTools]),
        [DefaultStorageAccountID] = CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, [DefaultStorageAccountID]) END,
        [SearchScopeAccess] = ISNULL(@SearchScopeAccess, [SearchScopeAccess])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_CreatedByAgentIDID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CategoryID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Name nvarchar(425)
    DECLARE @MJActions_CreatedByAgentID_Description nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Type nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_UserComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Code nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_CreatedByAgentID_CodeLocked bit
    DECLARE @MJActions_CreatedByAgentID_ForceCodeGeneration bit
    DECLARE @MJActions_CreatedByAgentID_RetentionPeriod int
    DECLARE @MJActions_CreatedByAgentID_Status nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_DriverClass nvarchar(255)
    DECLARE @MJActions_CreatedByAgentID_ParentID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_IconClass nvarchar(100)
    DECLARE @MJActions_CreatedByAgentID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Config nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_MaxExecutionTimeMS int
    DECLARE @MJActions_CreatedByAgentID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_CreatedByAgentID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [CreatedByAgentID] = @ID

    OPEN cascade_update_MJActions_CreatedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_CreatedByAgentID_CreatedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_CreatedByAgentIDID, @CategoryID = @MJActions_CreatedByAgentID_CategoryID, @Name = @MJActions_CreatedByAgentID_Name, @Description = @MJActions_CreatedByAgentID_Description, @Type = @MJActions_CreatedByAgentID_Type, @UserPrompt = @MJActions_CreatedByAgentID_UserPrompt, @UserComments = @MJActions_CreatedByAgentID_UserComments, @Code = @MJActions_CreatedByAgentID_Code, @CodeComments = @MJActions_CreatedByAgentID_CodeComments, @CodeApprovalStatus = @MJActions_CreatedByAgentID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_CreatedByAgentID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_CreatedByAgentID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_CreatedByAgentID_CodeApprovedAt, @CodeLocked = @MJActions_CreatedByAgentID_CodeLocked, @ForceCodeGeneration = @MJActions_CreatedByAgentID_ForceCodeGeneration, @RetentionPeriod = @MJActions_CreatedByAgentID_RetentionPeriod, @Status = @MJActions_CreatedByAgentID_Status, @DriverClass = @MJActions_CreatedByAgentID_DriverClass, @ParentID = @MJActions_CreatedByAgentID_ParentID, @IconClass = @MJActions_CreatedByAgentID_IconClass, @DefaultCompactPromptID = @MJActions_CreatedByAgentID_DefaultCompactPromptID, @Config = @MJActions_CreatedByAgentID_Config, @RuntimeActionConfiguration = @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @CreatedByAgentID_Clear = 1, @CreatedByAgentID = @MJActions_CreatedByAgentID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_CreatedByAgentID_cursor
    DEALLOCATE cascade_update_MJActions_CreatedByAgentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool
    DECLARE @MJAIAgentClientTools_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentClientTools_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentClientTool]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentClientTools_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentClientTool] @ID = @MJAIAgentClientTools_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_AgentID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope
    DECLARE @MJAIAgentSearchScopes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSearchScope]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] @ID = @MJAIAgentSearchScopes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID_Clear = 1, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ParentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SearchScopeAccess nvarchar(20)
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AssistantPrefill nvarchar(MAX)
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_AgentID_AgentRunID, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog
    DECLARE @MJSearchExecutionLogs_AIAgentIDID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_SearchScopeID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_UserID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_AIAgentID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_Query nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_TotalDurationMs int
    DECLARE @MJSearchExecutionLogs_AIAgentID_ResultCount int
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerName nvarchar(100)
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerCostCents decimal(10, 4)
    DECLARE @MJSearchExecutionLogs_AIAgentID_Status nvarchar(20)
    DECLARE @MJSearchExecutionLogs_AIAgentID_FailureReason nvarchar(500)
    DECLARE @MJSearchExecutionLogs_AIAgentID_ProvidersJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON
    END

    CLOSE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    DEALLOCATE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration];

/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Config nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS int
    DECLARE @MJActions_DefaultCompactPromptID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID_Clear = 1, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @Config = @MJActions_DefaultCompactPromptID_Config, @RuntimeActionConfiguration = @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @CreatedByAgentID = @MJActions_DefaultCompactPromptID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID, @MJActions_DefaultCompactPromptID_Config, @MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, @MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, @MJActions_DefaultCompactPromptID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID_Clear = 1, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID_Clear = 1, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_AssignmentStrategy nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema], [AssignmentStrategy], [DefaultStorageAccountID]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID_Clear = 1, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @AssignmentStrategy = @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @DefaultStorageAccountID = @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema, @MJAIAgentTypes_SystemPromptID_AssignmentStrategy, @MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess nvarchar(20)
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID_Clear = 1, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @CategoryID = @MJAIAgents_ContextCompressionPromptID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, @MJAIAgents_ContextCompressionPromptID_CategoryID, @MJAIAgents_ContextCompressionPromptID_AllowEphemeralClientTools, @MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, @MJAIAgents_ContextCompressionPromptID_SearchScopeAccess
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID_Clear = 1, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID_Clear = 1, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AssistantPrefill nvarchar(MAX)
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_JudgeID_AgentRunID, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID_Clear = 1, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_JudgeID_AssistantPrefill

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID, @MJAIPromptRuns_JudgeID_AssistantPrefill
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ChildPromptID_AgentRunID, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID_Clear = 1, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ChildPromptID_AssistantPrefill

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID, @MJAIPromptRuns_ChildPromptID_AssistantPrefill
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels bit
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel], [AssistantPrefill], [PrefillFallbackMode], [RequireSpecificModels]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID_Clear = 1, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @AssistantPrefill = @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @PrefillFallbackMode = @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @RequireSpecificModels = @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel, @MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, @MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, @MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* spDelete Permissions for MJ: AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7510fa4-6b65-4492-a7ff-2886af0fdd13' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f7510fa4-6b65-4492-a7ff-2886af0fdd13',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
            100013,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce151b90-76f1-4679-8032-de008596fa49' OR (EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2' AND Name = 'FileStorageAccount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'ce151b90-76f1-4679-8032-de008596fa49',
            'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', -- Entity: MJ: Search Scope Storage Accounts
            100014,
            'FileStorageAccount',
            'File Storage Account',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e1be192-9612-4edc-85ee-6a7f89ec9a6c' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2e1be192-9612-4edc-85ee-6a7f89ec9a6c',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100029,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a4d5e34-5715-4978-b577-e962c2f3cf0f' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6a4d5e34-5715-4978-b577-e962c2f3cf0f',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100030,
            'User',
            'User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af061599-4810-4876-a724-03ae4769d484' OR (EntityID = '530982B5-5556-483A-A4D7-338A19E53548' AND Name = 'AIAgent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'af061599-4810-4876-a724-03ae4769d484',
            '530982B5-5556-483A-A4D7-338A19E53548', -- Entity: MJ: Search Execution Logs
            100031,
            'AIAgent',
            'AI Agent',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82dd578f-8fb6-4e05-a6fc-eae72a475096' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '82dd578f-8fb6-4e05-a6fc-eae72a475096',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100019,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44bda962-5405-497c-b4a3-9a38df89e73e' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'SearchProvider')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '44bda962-5405-497c-b4a3-9a38df89e73e',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100020,
            'SearchProvider',
            'Search Provider',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3de74202-a1db-4ad3-b5a3-ff83e19fd97e' OR (EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3' AND Name = 'QueryTransformTemplate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3de74202-a1db-4ad3-b5a3-ff83e19fd97e',
            '211DD116-32C7-43B4-B147-418F76B0E0E3', -- Entity: MJ: Search Scope Providers
            100021,
            'QueryTransformTemplate',
            'Query Transform Template',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1f7137f-1b2a-4b12-8569-7ec20ed05c96' OR (EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8' AND Name = 'OwnerUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd1f7137f-1b2a-4b12-8569-7ec20ed05c96',
            '3F83C084-859F-49C3-A8A0-4693E0777BE8', -- Entity: MJ: Search Scopes
            100031,
            'OwnerUser',
            'Owner User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2d862b18-1d7d-4701-83c6-7b7c3f79e81b' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2d862b18-1d7d-4701-83c6-7b7c3f79e81b',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
            100015,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fe5aeb5-4c21-4381-b45e-4ab5384888ea' OR (EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '1fe5aeb5-4c21-4381-b45e-4ab5384888ea',
            '20BCABEC-413F-4985-8F5A-6BC262E75F81', -- Entity: MJ: Search Scope Entities
            100016,
            'Entity',
            'Entity',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b7edc6f-322c-4933-925d-567e07d8c11a' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'Agent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0b7edc6f-322c-4933-925d-567e07d8c11a',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100031,
            'Agent',
            'Agent',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c7c0308-f079-4515-94f0-d9587fae1414' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '0c7c0308-f079-4515-94f0-d9587fae1414',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100032,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db588640-89aa-4b25-8523-99b9c973785b' OR (EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166' AND Name = 'QueryTemplate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'db588640-89aa-4b25-8523-99b9c973785b',
            'C1406BFB-9351-4BF5-966A-70B9A5D82166', -- Entity: MJ: AI Agent Search Scopes
            100033,
            'QueryTemplate',
            'Query Template',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf618893-6689-4ee2-bbdf-f1dcc7854f86' OR (EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'bf618893-6689-4ee2-bbdf-f1dcc7854f86',
            '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', -- Entity: MJ: Search Scope Test Queries
            100019,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8da3d87d-9dec-430b-9e99-e738b2302065' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8da3d87d-9dec-430b-9e99-e738b2302065',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100015,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7e0fbca-028a-4610-aaf4-30ca6a439252' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f7e0fbca-028a-4610-aaf4-30ca6a439252',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100016,
            'User',
            'User',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '62e49f65-1aa6-40f0-84b8-1a65d8ceac06' OR (EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '62e49f65-1aa6-40f0-84b8-1a65d8ceac06',
            'B90FAB4E-0336-407A-B6AE-A49DEA84D083', -- Entity: MJ: Search Scope Permissions
            100017,
            'Role',
            'Role',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8793f0e-c9b5-498e-b858-3ab08f986555' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'SearchScope')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a8793f0e-c9b5-498e-b858-3ab08f986555',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100019,
            'SearchScope',
            'Search Scope',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc70b68e-3800-4c66-9827-70dde27fa50e' OR (EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB' AND Name = 'VectorIndex')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cc70b68e-3800-4c66-9827-70dde27fa50e',
            '3B80A286-D1E1-45C2-9648-C850009E1ADB', -- Entity: MJ: Search Scope External Indexes
            100020,
            'VectorIndex',
            'Vector Index',
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
               SET IsNameField = 1
               WHERE ID = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F66D6720-E1E5-48AA-934F-7C2B3784EF0D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B907068F-ABD3-43A1-BF34-820CD089BC9D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '82DD578F-8FB6-4E05-A6FC-EAE72A475096'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '44BDA962-5405-497C-B4A3-9A38DF89E73E'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '8DA3D87D-9DEC-430B-9E99-E738B2302065'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8D0985D-B898-402A-83C8-E9816ACD3965'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8DA3D87D-9DEC-430B-9E99-E738B2302065'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8DA3D87D-9DEC-430B-9E99-E738B2302065'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6255F1D5-A755-4355-A34C-CF89E18F4BA6'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6255F1D5-A755-4355-A34C-CF89E18F4BA6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CE151B90-76F1-4679-8032-DE008596FA49'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '84D4B55F-4270-4C1A-8E3E-B5F6E8879B5B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A4A044AB-961D-4100-8E92-7BB10F8433CD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D1F7137F-1B2A-4B12-8569-7EC20ED05C96'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7C71AB7F-5318-42C6-B34F-5D6EF4462C90'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B01CC6B5-03A8-46D2-8C7F-B6F9DBB4FEF2'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
               AND AutoUpdateUserSearchPredicate = 1
            

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '94F3FC15-08C6-4FE2-AC3B-D234DFFFABBE'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA'
               AND AutoUpdateUserSearchPredicate = 1
            

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '20BCABEC-413F-4985-8F5A-6BC262E75F81'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '0B7EDC6F-322C-4933-925D-567E07D8C11A'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '0C7C0308-F079-4515-94F0-D9587FAE1414'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '301FFE95-1405-4200-85C0-E2EE4BADDE99'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '44A7C7B2-7C8A-4199-A08D-C068DF677E6B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0B7EDC6F-322C-4933-925D-567E07D8C11A'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0C7C0308-F079-4515-94F0-D9587FAE1414'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0B7EDC6F-322C-4933-925D-567E07D8C11A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0C7C0308-F079-4515-94F0-D9587FAE1414'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'A8793F0E-C9B5-498E-B858-3AB08F986555'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5D7F70E8-E16B-48A7-B0F7-B29355040E84'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7F0CBAB5-D960-4621-BB6E-CBC0340F4968'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A8793F0E-C9B5-498E-B858-3AB08F986555'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CC70B68E-3800-4C66-9827-70DDE27FA50E'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5D7F70E8-E16B-48A7-B0F7-B29355040E84'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7F0CBAB5-D960-4621-BB6E-CBC0340F4968'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A8793F0E-C9B5-498E-B858-3AB08F986555'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '5D7F70E8-E16B-48A7-B0F7-B29355040E84'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6DE3B564-29DA-4A88-A1EA-FD968E86108D'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3F4DDA5D-0D6B-43AD-A9A6-6569E8038C78'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6DE3B564-29DA-4A88-A1EA-FD968E86108D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '3A38C86B-90E6-4B6B-84BD-505F5C079E12'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '13617353-79F1-409B-AA4F-9FD96A5A7AAD'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '13617353-79F1-409B-AA4F-9FD96A5A7AAD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '475FC885-98CA-43A9-89BB-88CD64531C98'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6A4D5E34-5715-4978-B577-E962C2F3CF0F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '13617353-79F1-409B-AA4F-9FD96A5A7AAD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6A4D5E34-5715-4978-B577-E962C2F3CF0F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF061599-4810-4876-A724-03AE4769D484'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '6A4D5E34-5715-4978-B577-E962C2F3CF0F'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'AF061599-4810-4876-A724-03AE4769D484'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0DFCF074-13A3-4068-B5D9-6032D424D112' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '32221C7E-325D-4AFB-B7A5-3B0F5F52834D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7510FA4-6B65-4492-A7FF-2886AF0FDD13' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.FileStorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD032D1E-1B51-48BA-ACE1-AEF987C7F7AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.FileStorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE151B90-76F1-4679-8032-DE008596FA49' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.FolderPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Storage Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6255F1D5-A755-4355-A34C-CF89E18F4BA6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3197E4B7-B5EC-4CEF-B6F7-BFCE3B292F53' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Storage Accounts.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B6805C1-BBD9-47E1-A678-6C9525AC5449' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-folder-open */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-folder-open', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7f0ed9a7-2d9d-4225-8ff8-c4fd543072f0', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'FieldCategoryInfo', '{"Scope Configuration":{"icon":"fa fa-search","description":"Links the storage account to a specific search scope context"},"Storage Configuration":{"icon":"fa fa-hdd","description":"Details regarding the file storage account and optional folder path restrictions"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8712171c-eb71-4931-bce1-212aa3b03e82', 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2', 'FieldCategoryIcons', '{"Scope Configuration":"fa fa-search","Storage Configuration":"fa fa-hdd","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'ED43D812-86D7-42F6-A2A2-2E657ACAEDE2';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BD7C23C-8241-4E1A-B247-A8F14E32BC19' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D862B18-1D7D-4701-83C6-7B7C3F79E81B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EDBC9655-6E2E-42AF-BF84-AED9DA27C950' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Entity Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1FE5AEB5-4C21-4381-B45E-4AB5384888EA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Entity Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04D1E6AB-0EA1-44F8-932A-56359CEA29B6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.ExtraFilter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '94F3FC15-08C6-4FE2-AC3B-D234DFFFABBE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.UserSearchString 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '441D9670-AE89-4F60-AA1F-559E58B84CA0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '32B349A9-34AE-4FF5-9381-8B8B3B713488' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Entities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '894D9770-E13A-4574-9742-6B763EDDA34D' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-search */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '20BCABEC-413F-4985-8F5A-6BC262E75F81';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('be9b1b19-1582-458c-9269-7fb90b9d35bf', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'FieldCategoryInfo', '{"Scope Configuration":{"icon":"fa fa-crosshairs","description":"Defines the high-level search scope and its identifier"},"Entity Configuration":{"icon":"fa fa-database","description":"Maps specific entities to the search scope"},"Search Logic":{"icon":"fa fa-code","description":"Advanced technical configurations for filtering and query overrides"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a28110bf-7c31-488e-a076-a5604d08a0d1', '20BCABEC-413F-4985-8F5A-6BC262E75F81', 'FieldCategoryIcons', '{"Scope Configuration":"fa fa-crosshairs","Entity Configuration":"fa fa-database","Search Logic":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '20BCABEC-413F-4985-8F5A-6BC262E75F81';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A65342F4-8289-4FE8-84E0-B0AD6ABBF27E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Scope',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F4D48AC-A66F-4ADF-9DFE-9931EDA4B876' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Scope',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8DA3D87D-9DEC-430B-9E99-E738B2302065' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.PermissionLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Permission Scope',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8D0985D-B898-402A-83C8-E9816ACD3965' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B6000C0-2ADA-462A-95DB-347997D1B7DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7E0FBCA-028A-4610-AAF4-30CA6A439252' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '806A6BEF-8E3A-4957-B122-DD08B62727D2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '62E49F65-1AA6-40F0-84B8-1A65D8CEAC06' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30576DD7-1752-48BD-85B1-D9655BBB055F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '26A95BD0-FF2E-420C-AFCE-F005811F1E47' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-shield-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1857ef52-e2da-4c70-a38c-b715414f8542', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'FieldCategoryInfo', '{"Permission Scope":{"icon":"fa fa-search","description":"Defines the search scope and the level of access granted."},"Grantee Information":{"icon":"fa fa-user-shield","description":"Specifies the individual user or role receiving the permission."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('47639fd2-ab67-4de6-b5ba-0446c61910ca', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083', 'FieldCategoryIcons', '{"Permission Scope":"fa fa-search","Grantee Information":"fa fa-user-shield","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'B90FAB4E-0336-407A-B6AE-A49DEA84D083';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7A8D248C-CA1C-4851-9B30-C2F39950D0F0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7B0E695-7A9D-4D36-A860-CAA0FE743A93' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8793F0E-C9B5-498E-B858-3AB08F986555' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.IndexType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D7F70E8-E16B-48A7-B0F7-B29355040E84' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.VectorIndexID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC4C6581-35DE-4B31-9049-4F385E83DAA4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.VectorIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC70B68E-3800-4C66-9827-70DDE27FA50E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.ExternalIndexName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Index Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F0CBAB5-D960-4621-BB6E-CBC0340F4968' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.ExternalIndexConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '8405E520-F9CC-45A0-86FA-62BA702B706A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.MetadataFilter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '5494CA26-73E8-47E9-A35F-7CCD0AEBAA28' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FBBBD9F-D8F3-4E8A-A8D7-BFEC6CE6FE73' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope External Indexes.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '062CBF53-A21B-46DE-9BCE-4A2E0CB5C621' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-search-plus */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search-plus', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3B80A286-D1E1-45C2-9648-C850009E1ADB';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a9c14c43-af95-4a81-83ce-18e863490e37', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'FieldCategoryInfo', '{"Scope Identification":{"icon":"fa fa-tag","description":"Core identification fields for the search scope entity"},"Index Configuration":{"icon":"fa fa-database","description":"Technical settings defining the search provider and index target"},"Advanced Settings":{"icon":"fa fa-code","description":"JSON-based configuration and filtering logic for advanced integration"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('66368205-682c-4d4f-9664-735a4405e862', '3B80A286-D1E1-45C2-9648-C850009E1ADB', 'FieldCategoryIcons', '{"Scope Identification":"fa fa-tag","Index Configuration":"fa fa-database","Advanced Settings":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3B80A286-D1E1-45C2-9648-C850009E1ADB';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C14A9B8E-7DC2-4EE8-865A-CB9E310DF2E5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '451A3F52-A5DF-4099-8BC0-E3588C9220AC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '82DD578F-8FB6-4E05-A6FC-EAE72A475096' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.SearchProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Provider',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '95740918-B09C-4EEB-A612-352BEE7B4D1C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.SearchProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Provider Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44BDA962-5405-497C-B4A3-9A38DF89E73E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.Enabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F66D6720-E1E5-48AA-934F-7C2B3784EF0D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.MaxResultsOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B907068F-ABD3-43A1-BF34-820CD089BC9D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.ProviderConfigOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'AFFA4EA1-E4A3-4E9A-99CC-D9AFFAEFA432' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.QueryTransformTemplateID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Transformation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Query Transform Template',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58E855E8-F804-4A0E-B0AC-722EC76941D8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.QueryTransformTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Transformation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Query Transform Template Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3DE74202-A1DB-4AD3-B5A3-FF83E19FD97E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F94A390-0411-4581-AEF7-5384B72EE79D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Providers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3EFD97CC-7FFA-4A58-A5B7-B31E44FBEF36' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-search-plus */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search-plus', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '211DD116-32C7-43B4-B147-418F76B0E0E3';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b7e43577-9fa2-4cf2-92c0-3a2fd50bc14b', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'FieldCategoryInfo', '{"Provider Association":{"icon":"fa fa-link","description":"Links and descriptive names identifying the search scope and provider relationship"},"Configuration Settings":{"icon":"fa fa-sliders-h","description":"Operational settings for enabling providers and overriding default behaviors"},"Query Transformation":{"icon":"fa fa-magic","description":"Settings for rewriting user queries before they reach the provider"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b7a4b0ab-2d67-4ee9-83ac-8c2abb4e0d5a', '211DD116-32C7-43B4-B147-418F76B0E0E3', 'FieldCategoryIcons', '{"Provider Association":"fa fa-link","Configuration Settings":"fa fa-sliders-h","Query Transformation":"fa fa-magic","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '211DD116-32C7-43B4-B147-418F76B0E0E3';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F2103B7-2FCF-4BBC-AEA2-C53A0BBD3822' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CFE7D72F-79D3-4AA9-8469-207C2151C14B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF618893-6689-4EE2-BBDF-F1DCC7854F86' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.Label 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A38C86B-90E6-4B6B-84BD-505F5C079E12' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.Query 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '6DE3B564-29DA-4A88-A1EA-FD968E86108D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Query Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4ADE8DA-300C-4A10-A142-9680F9882D7C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.ExpectedTopResultEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation Criteria',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8DE8947-B323-4098-9FE6-E06CA34C80C5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.ExpectedTopResultRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Validation Criteria',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D75CFA63-3B07-4F40-BB28-47C5365DFEDA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '923C5D6D-BED9-4550-929A-83CD2FF44C0A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scope Test Queries.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F4DDA5D-0D6B-43AD-A9A6-6569E8038C78' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-search */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('bb01cb91-24c9-493e-9836-c4785bd1110d', '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', 'FieldCategoryInfo', '{"Search Configuration":{"icon":"fa fa-cogs","description":"Links and references to the Search Scope being tuned."},"Query Definition":{"icon":"fa fa-search","description":"The specific query text and descriptive labels for the test case."},"Validation Criteria":{"icon":"fa fa-check-circle","description":"Expected outcomes used to validate search performance and regression."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('91b9f30b-6e1e-4b26-8f62-9f03cc73888e', '04AD87E6-EB56-49B7-B9E2-8F5E44458F27', 'FieldCategoryIcons', '{"Search Configuration":"fa fa-cogs","Query Definition":"fa fa-search","Validation Criteria":"fa fa-check-circle","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 1, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '04AD87E6-EB56-49B7-B9E2-8F5E44458F27';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Search Scopes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF722ABD-E0AC-4791-A694-1A5C308844A2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B01CC6B5-03A8-46D2-8C7F-B6F9DBB4FEF2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C71AB7F-5318-42C6-B34F-5D6EF4462C90' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C639CB34-93B2-45FD-A8B6-197F01F30DA3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.IsGlobal 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84D4B55F-4270-4C1A-8E3E-B5F6E8879B5B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.IsDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Scope Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A4A044AB-961D-4100-8E92-7BB10F8433CD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.OwnerUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A515DCD2-C9CD-471F-A6F2-2DB35D3C5C03' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.OwnerUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D1F7137F-1B2A-4B12-8569-7EC20ED05C96' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle and Availability',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CEE83CDC-CD11-4B85-8CA0-9F5841CC883F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.StartAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle and Availability',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '030DF56E-9DF6-4E5A-AE54-6C00C09356C5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.EndAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Lifecycle and Availability',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0262FC04-F9A2-42BF-A0A4-7028BF1AE80E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.ScopeConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scope Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '9641CA58-B2DF-48CE-B3AC-976C9E7F63D1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.SearchContextConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Context Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7183A757-830F-482E-9E41-77E5E641B814' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.RerankerBudgetCents 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reranker Budget (Cents)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9DEA41DD-E375-4D15-9A9A-4136FFC35194' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B481EDF6-17D5-4DEE-925C-FE300EEF446F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Scopes.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DAAC5CC2-1733-4E8A-9510-DF26DD36D2F7' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-search-plus */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search-plus', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '3F83C084-859F-49C3-A8A0-4693E0777BE8';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('20e1b1e3-97b7-4dd2-a64b-7872474edbe1', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Core descriptive fields for identifying the search scope"},"Scope Behavior":{"icon":"fa fa-toggle-on","description":"Settings that define how the scope interacts with the system defaults"},"Access Control":{"icon":"fa fa-lock","description":"Visibility and ownership settings for the search scope"},"Lifecycle and Availability":{"icon":"fa fa-calendar-alt","description":"Time-based activation and operational status settings"},"Configuration":{"icon":"fa fa-cogs","description":"Advanced technical parameters and JSON configurations"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1a1abd9d-3293-4a09-a7ba-32a88e0e028d', '3F83C084-859F-49C3-A8A0-4693E0777BE8', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Scope Behavior":"fa fa-toggle-on","Access Control":"fa fa-lock","Lifecycle and Availability":"fa fa-calendar-alt","Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '3F83C084-859F-49C3-A8A0-4693E0777BE8';

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F68EC93D-8CB6-4D35-881C-0DCCD4E42DB6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A2E7A5D8-B241-48FA-B0AD-979DAE320266' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0E907E7-044E-4298-9BBE-7A2387B855F4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B7EDC6F-322C-4933-925D-567E07D8C11A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C7C0308-F079-4515-94F0-D9587FAE1414' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.Phase 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Execution Phase',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D5BE679C-0809-4ADB-AE19-71CE14FA00FD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E6EF21B2-CB3C-4D05-8A73-65C55897468C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.IsDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Control',
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Default Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44A7C7B2-7C8A-4199-A08D-C068DF677E6B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution Control',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '301FFE95-1405-4200-85C0-E2EE4BADDE99' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.StartAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C42E55CF-DA62-47F7-9CDC-BAF87CF00CFB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.EndAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E12BF45E-E0CD-4188-A221-82C9FC22EBB2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.MaxResults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '543F7E2C-80E0-4024-9167-667616359F68' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.MinScore 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Minimum Score',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2EEC11CA-4F71-4AEF-AC50-97F2372C93B1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.QueryTemplateID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Query Template',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E8E32952-3858-475F-BFB6-C918D181D270' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.QueryTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Query Template Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB588640-89AA-4B25-8523-99B9C973785B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.FusionWeightsOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B5CE6D24-4C59-4BBB-B2F6-E8F0FFBEDD40' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6522A09-72F4-472B-9601-1FC16D475DDC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agent Search Scopes.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AD7C7CF-B0E7-4D59-898D-0DF744F6ABE7' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-search-plus */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search-plus', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4322AA22-D7BC-485D-9196-3D5B6DE3185D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.SearchScopeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0497A66-B889-4B67-BF77-1BB7A21754CF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.SearchScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Scope Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E1BE192-9612-4EDC-85EE-6A7F89EC9A6C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Initiator Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '17D7AB0C-2ECC-4BED-9618-DD92F465D25B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Initiator Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A4D5E34-5715-4978-B577-E962C2F3CF0F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.AIAgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Initiator Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AC56098-A8C6-432D-A5A2-2C8C40E5AD1D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.AIAgent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Initiator Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'AI Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF061599-4810-4876-A724-03AE4769D484' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.Query 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13617353-79F1-409B-AA4F-9FD96A5A7AAD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.TotalDurationMs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Execution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Total Duration (ms)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF77DD4A-6BFC-4AE3-9E61-039D9B96941F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.ResultCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5906C5C-B5BC-48B2-A819-746CD09E913B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AF906F8-8E8C-423E-B7E9-6E2157823CAB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.FailureReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D69E7A8-1917-4231-A697-A5A5C9788D0E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.RerankerName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Reranker Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCB15200-656C-4EA2-972D-34F48F9F78E4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.RerankerCostCents 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Reranker Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reranker Cost (Cents)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '72BEE633-F344-4BB1-874B-93E551AE60DA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.ProvidersJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Execution',
   GeneratedFormSection = 'Category',
   DisplayName = 'Providers Breakdown',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '3F7FCEEC-BE05-4AD3-B4C2-998C087DCA75' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '475FC885-98CA-43A9-89BB-88CD64531C98' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Execution Logs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EB11D11-E68B-407A-B681-BF711F646638' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('433e53ff-de77-42a3-9040-cfd3e6f36776', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'FieldCategoryInfo', '{"Assignment Details":{"icon":"fa fa-link","description":"Core relationships linking agents to their specific search scopes"},"Execution Control":{"icon":"fa fa-sliders-h","description":"Settings governing when and how the scope is triggered during agent execution"},"Timeline":{"icon":"fa fa-calendar-alt","description":"Time-based activation and expiry windows for this assignment"},"Search Configuration":{"icon":"fa fa-cogs","description":"Technical overrides for search behavior including results, scoring, and query templates"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('748e98da-86d5-4918-a92e-25bc0c909ba5', 'C1406BFB-9351-4BF5-966A-70B9A5D82166', 'FieldCategoryIcons', '{"Assignment Details":"fa fa-link","Execution Control":"fa fa-sliders-h","Timeline":"fa fa-calendar-alt","Search Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C1406BFB-9351-4BF5-966A-70B9A5D82166';

/* Set entity icon to fa fa-search */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '530982B5-5556-483A-A4D7-338A19E53548';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3076cf33-59d0-4d8e-82f7-aa434659a0e7', '530982B5-5556-483A-A4D7-338A19E53548', 'FieldCategoryInfo', '{"Search Context":{"icon":"fa fa-map-marker-alt","description":"Information regarding the scope and context of the search"},"Initiator Details":{"icon":"fa fa-user-circle","description":"Details about the user or AI agent who triggered the search"},"Search Execution":{"icon":"fa fa-tachometer-alt","description":"Performance metrics, outcomes, and raw data from the search invocation"},"Reranker Details":{"icon":"fa fa-sliders-h","description":"Information regarding the reranking stage of the search"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a4d42fa1-f910-4fe9-bbbe-c87206cfef51', '530982B5-5556-483A-A4D7-338A19E53548', 'FieldCategoryIcons', '{"Search Context":"fa fa-map-marker-alt","Initiator Details":"fa fa-user-circle","Search Execution":"fa fa-tachometer-alt","Reranker Details":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '530982B5-5556-483A-A4D7-338A19E53548';

/* Set categories for 74 fields */

-- UPDATE Entity Field Category Info MJ: AI Agents.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.LogoURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '77845738-5781-458B-AD3C-5DAE745373C2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.TypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91CA077D-3F59-48E1-A593-AF8686276115' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.IconClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ModelSelectionMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.OwnerUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ArtifactCreationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.FunctionalRequirements 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.TechnicalDesign 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.IsRestricted 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5B17B79-282F-4F19-9656-246DE119D588' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.AgentTypePromptParams 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Prompt Parameters',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.CategoryID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.OwnerUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3177830D-10A0-4003-B95D-8514974BA846' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ExposeAsAction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ExecutionOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '090830CE-4073-486C-BBF2-E2105BEADD91' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ExecutionMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.InvocationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52E74C81-D246-4B52-B7A7-91757C299671' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.RootParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '644AA4B2-1044-430C-BCBA-245644294E02' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.EnableContextCompression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageThreshold 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Message Threshold',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '451D5C8F-6749-4789-A158-658B38A74AE4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPromptID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Compression Prompt',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageRetentionCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Retention Count',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73A50D68-976F-49A7-9737-12D1D26C6011' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPrompt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Compression Prompt Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadDownstreamPaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Downstream Paths',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85B6AA86-796D-4970-9E35-5A483498B517' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadUpstreamPaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Upstream Paths',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfReadPaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Self Read Paths',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfWritePaths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Self Write Paths',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadScope 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E542986-0164-4B9E-8457-06826A4AB892' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C7959AE-F48B-4858-8383-28C3F4706314' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Final Validation Mode',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMaxRetries 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Max Validation Retries',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidationMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Starting Validation Mode',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.InjectNotes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxNotesToInject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Max Notes to Inject',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.NoteInjectionStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.InjectExamples 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxExamplesToInject 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Max Examples to Inject',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ExampleInjectionStrategy 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '291FEE7A-1245-4C82-A470-07EEB8847F1E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxCostPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23850C5A-311A-4271-AE53-BD36921C5AA5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxTokensPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxIterationsPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxTimePerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MinExecutionsPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxExecutionsPerRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultPromptEffortLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Effort Level',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ChatHandlingOption 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MessageMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '445C1618-EADB-4B34-B318-40C662141FE1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxMessages 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F8924303-D53A-43B0-B70F-5B74FA6248D9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.AllowEphemeralClientTools 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Allow Ephemeral Tools',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Provider',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.AttachmentRootPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Path',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA112220-B0D8-4C6F-B63A-027EB706B132' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.InlineStorageThresholdBytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Inline Storage Threshold',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.AttachmentStorageProvider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Provider Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Attachment Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Storage Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76AF4818-C79E-4DB5-8039-6B51C1C3A832' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultStorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Attachment Storage',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Storage Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D900C3B8-F414-4468-AAA1-3CEB52C80ACD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ScopeConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.NoteRetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.ExampleRetentionDays 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A112A808-63DB-4B48-B38F-06554B912DED' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.AutoArchiveEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85774265-68C5-4067-9C2B-F70A7F21B94A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.RerankerConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '269087F5-DEBE-4B14-8FA3-5938ADCF7325' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: AI Agents.SearchScopeAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Retrieval & Ranking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB' AND AutoUpdateCategory = 1;

/* Generated Validation Functions for MJ: Search Scope External Indexes */
-- CHECK constraint for MJ: Search Scope External Indexes @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([IndexType]=''Vector'' AND [VectorIndexID] IS NOT NULL OR [IndexType]<>''Vector'' AND [ExternalIndexName] IS NOT NULL)', 'public ValidateIndexTypeRequirements(result: ValidationResult) {
	// If the index is a Vector type, ensure a Vector Index ID is provided
	if (this.IndexType === ''Vector'' && this.VectorIndexID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"VectorIndexID",
			"A Vector Index ID is required when the Index Type is set to ''Vector''.",
			this.VectorIndexID,
			ValidationErrorType.Failure
		));
	}
	// If the index is not a Vector type, ensure an External Index Name is provided
	if (this.IndexType !== ''Vector'' && (this.ExternalIndexName == null || this.ExternalIndexName.length === 0)) {
		result.Errors.push(new ValidationErrorInfo(
			"ExternalIndexName",
			"An External Index Name is required for the selected Index Type.",
			this.ExternalIndexName,
			ValidationErrorType.Failure
		));
	}
}', 'To ensure search functionality works correctly, vector-based indexes must have a Vector Index ID assigned, while all other index types must have an External Index Name specified.', 'ValidateIndexTypeRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3B80A286-D1E1-45C2-9648-C850009E1ADB');

/* Generated Validation Functions for MJ: Search Scope Permissions */
-- CHECK constraint for MJ: Search Scope Permissions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([UserID] IS NOT NULL AND [RoleID] IS NULL OR [UserID] IS NULL AND [RoleID] IS NOT NULL)', 'public ValidateUserIDAndRoleIDExclusiveAssignment(result: ValidationResult) {
	// Check if both fields are null (violates the requirement that at least one must be set)
	if (this.UserID == null && this.RoleID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"UserID",
			"Each record must be assigned to either a User or a Role.",
			this.UserID,
			ValidationErrorType.Failure
		));
	}
	// Check if both fields are populated (violates the requirement that only one can be set)
	if (this.UserID != null && this.RoleID != null) {
		result.Errors.push(new ValidationErrorInfo(
			"UserID",
			"A record cannot be assigned to both a User and a Role simultaneously.",
			this.UserID,
			ValidationErrorType.Failure
		));
	}
}', 'Each record must be assigned to either a specific user or a specific role, but not both. This ensures that permissions or scopes are clearly defined for a single entity type and prevents ambiguous assignments.', 'ValidateUserIDAndRoleIDExclusiveAssignment', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B90FAB4E-0336-407A-B6AE-A49DEA84D083');

