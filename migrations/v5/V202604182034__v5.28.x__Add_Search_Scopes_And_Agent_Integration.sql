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












































































-- CODEGEN RUN
